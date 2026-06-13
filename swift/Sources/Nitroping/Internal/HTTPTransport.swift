//
//  HTTPTransport.swift
//  Nitroping
//
//  Thin URLSession wrapper. Folds non-2xx responses into NitropingError so
//  the client subclients can focus on the happy path.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
import os.log

/// Methods we use. `PUT` is used by the device-update endpoint.
enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
}

/// Allows tests to inject a stub session. `URLSession` itself conforms;
/// production callers don't need to think about this.
public protocol NitropingURLSession: Sendable {
    func data(for request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: NitropingURLSession {}

/// Internal HTTP wrapper. One per `NitropingClient`.
struct HTTPTransport: Sendable {
    let baseURL: URL
    let apiKey: String
    let authScheme: String
    let session: NitropingURLSession
    let userAgent: String
    let logger: Logger

    init(baseURL: URL, apiKey: String, session: NitropingURLSession, userAgent: String) {
        self.baseURL = baseURL
        self.apiKey = apiKey
        self.authScheme = apiKey.hasPrefix("pk_") ? "Public" : "ApiKey"
        self.session = session
        self.userAgent = userAgent
        self.logger = Logger(subsystem: "dev.nitroping.sdk", category: "http")
    }

    /// Encode-and-send a body.
    func send<Body: Encodable, Response: Decodable>(
        method: HTTPMethod,
        path: String,
        body: Body,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        let data = try await sendRaw(
            method: method,
            path: path,
            body: body,
            idempotencyKey: idempotencyKey
        )
        if Response.self == EmptyResponse.self {
            // Caller doesn't care about the body — short-circuit to avoid
            // requiring the server to always return JSON on 204s.
            // swiftlint:disable:next force_cast
            return EmptyResponse() as! Response
        }
        do {
            let decoder = JSONDecoder()
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw NitropingError.decoding("Failed to decode \(Response.self): \(error)")
        }
    }

    /// Convenience overload for endpoints with no request body.
    func send<Response: Decodable>(
        method: HTTPMethod,
        path: String,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        try await send(
            method: method,
            path: path,
            body: EmptyBody(),
            idempotencyKey: idempotencyKey
        )
    }

    /// Send + return raw body. Used internally by `send`; exposed so a
    /// future endpoint that returns non-JSON can use it.
    func sendRaw<Body: Encodable>(
        method: HTTPMethod,
        path: String,
        body: Body,
        idempotencyKey: String? = nil
    ) async throws -> Data {
        let url = Self.makeURL(base: baseURL, path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("\(authScheme) \(apiKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        if let idempotencyKey {
            request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key")
        }
        if !(body is EmptyBody) {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            do {
                request.httpBody = try encoder.encode(body)
            } catch {
                throw NitropingError.validation("Failed to encode request body: \(error)")
            }
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw NitropingError.transport(String(describing: error))
        }

        guard let http = response as? HTTPURLResponse else {
            throw NitropingError.transport("Non-HTTP response from \(url.absoluteString)")
        }

        if (200..<300).contains(http.statusCode) {
            return data
        }

        throw mapErrorResponse(status: http.statusCode, headers: http.allHeaderFields, body: data)
    }

    /// Join a base URL + path that may or may not begin with `/`. Uses
    /// string concatenation rather than `URL.appendingPathComponent` to
    /// avoid the latter's tendency to percent-encode forward slashes on
    /// some Foundation builds.
    static func makeURL(base: URL, path: String) -> URL {
        var baseString = base.absoluteString
        if baseString.hasSuffix("/") { baseString.removeLast() }
        let normalisedPath = path.hasPrefix("/") ? path : "/" + path
        return URL(string: baseString + normalisedPath) ?? base
    }

    /// Translate a non-2xx response into the right `NitropingError` case.
    /// The server envelope looks like:
    ///
    ///     {"error": {"code": "validation_failed", "message": "...", "details": {...}}}
    private func mapErrorResponse(status: Int, headers: [AnyHashable: Any], body: Data) -> NitropingError {
        let envelope = (try? JSONDecoder().decode(ErrorEnvelope.self, from: body))?.error
        let code = envelope?.code
        let message = envelope?.message ?? "HTTP \(status)"
        let details = envelope?.details

        switch status {
        case 401:
            return .unauthorized(message: message)
        case 402, 403:
            return .forbidden(message: message, code: code)
        case 404:
            return .notFound(message: message)
        case 422:
            return .validationFailed(message: message, details: details)
        case 429:
            let retryAfter = (headers["Retry-After"] as? String).flatMap(TimeInterval.init)
            return .rateLimited(message: message, retryAfter: retryAfter)
        default:
            return .server(status: status, code: code, message: message)
        }
    }
}

/// Marker for endpoints that don't return a body we care about.
struct EmptyResponse: Decodable {}

/// Sentinel encodable used when a request has no body. The transport
/// special-cases this type to skip the body + Content-Type header.
struct EmptyBody: Encodable {}

private struct ErrorEnvelope: Decodable {
    let error: ErrorDetails?
    struct ErrorDetails: Decodable {
        let code: String?
        let message: String?
        let details: [String: [String]]?
    }
}
