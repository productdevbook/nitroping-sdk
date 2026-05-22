//
//  URLProtocolStub.swift
//  NitropingTests
//
//  URLProtocol-based interception used by ClientTests. Captures the last
//  request and replies with a canned (status, headers, body) triple.
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

final class URLProtocolStub: URLProtocol {
    struct Stub {
        let status: Int
        let body: Data
        let headers: [String: String]
    }

    /// Captured request from the last intercepted call.
    nonisolated(unsafe) static var lastRequest: URLRequest?
    /// Captured body bytes (httpBody isn't available on the live request the
    /// protocol sees, so the transport ferries it through here).
    nonisolated(unsafe) static var lastBody: Data?
    /// Canned response for the next call.
    nonisolated(unsafe) static var nextStub: Stub = Stub(
        status: 200,
        body: Data("{}".utf8),
        headers: [:]
    )

    static func reset() {
        lastRequest = nil
        lastBody = nil
        nextStub = Stub(status: 200, body: Data("{}".utf8), headers: [:])
    }

    static func makeSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [URLProtocolStub.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        // URLSession strips `httpBody` before handing it to the protocol;
        // pick it back up from `httpBodyStream` if needed.
        var captured = request
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            let bufferSize = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            captured.httpBody = data
            URLProtocolStub.lastBody = data
        } else {
            URLProtocolStub.lastBody = request.httpBody
        }
        URLProtocolStub.lastRequest = captured

        let stub = URLProtocolStub.nextStub
        let url = request.url!
        let response = HTTPURLResponse(
            url: url,
            statusCode: stub.status,
            httpVersion: "HTTP/1.1",
            headerFields: stub.headers
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
