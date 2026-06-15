//
//  NitropingClient+Devices.swift
//  Nitroping
//
//  `GET /api/v1/devices` + `POST /api/v1/devices` +
//  `DELETE /api/v1/devices/:id` + `DELETE /api/v1/devices` (by token).
//

import Foundation

public extension NitropingClient.Devices {
    /// List devices (secret key only). Wraps `GET /api/v1/devices`.
    ///
    /// Pass a `ListDevicesQuery` to filter by user, platform, status, or to
    /// paginate. The provider push **token is never returned** — the
    /// `DeviceSummary` rows carry no token field. Returns `{data, total}`.
    ///
    /// - Parameter query: optional filters / pagination. Defaults to the
    ///   first page of all devices.
    /// - Throws: `NitropingError` on any non-2xx response or transport error.
    func list(_ query: ListDevicesQuery = .init()) async throws -> ListDevicesResponse {
        var items: [URLQueryItem] = []
        if let userId = query.userId {
            items.append(URLQueryItem(name: "user_id", value: userId))
        }
        if let platform = query.platform {
            items.append(URLQueryItem(name: "platform", value: platform.rawValue))
        }
        if let status = query.status {
            items.append(URLQueryItem(name: "status", value: status.rawValue))
        }
        if let page = query.page {
            items.append(URLQueryItem(name: "page", value: String(page)))
        }
        if let pageSize = query.pageSize {
            items.append(URLQueryItem(name: "page_size", value: String(pageSize)))
        }
        return try await transport.send(
            method: .get,
            path: "/api/v1/devices",
            queryItems: items.isEmpty ? nil : items
        )
    }

    /// Register (or refresh) a device for push delivery.
    ///
    /// Server is idempotent on `(app, token, userId)` — calling more than
    /// once with the same triple returns the existing device with
    /// `created == false`. Safe to call from `application(_:didRegister...)`
    /// on every launch.
    ///
    /// - Parameter registration: token + platform + optional user / metadata.
    /// - Returns: server-assigned device id + whether this was a fresh row.
    /// - Throws: `NitropingError` on any non-2xx response or transport error.
    @discardableResult
    func register(_ registration: DeviceRegistration) async throws -> DeviceRegistrationResponse {
        guard !registration.token.isEmpty else {
            throw NitropingError.validation("DeviceRegistration.token must not be empty")
        }
        let path = transport.authScheme == "Public" ? "/api/v1/public/devices" : "/api/v1/devices"
        return try await transport.send(
            method: .post,
            path: path,
            body: registration
        )
    }

    /// Update a device — today only its tags. Wraps
    /// `PUT /api/v1/devices/:id` with body `{"tags": [...]}`. Pass `[]`
    /// to clear all tags. Returns the device id + tags after the update.
    ///
    /// - Throws: `NitropingError.notFound` (404) if the id is unknown.
    @discardableResult
    func update(id: String, tags: [String]) async throws -> DeviceUpdateResponse {
        guard !id.isEmpty else {
            throw NitropingError.validation("Device id must not be empty")
        }
        return try await transport.send(
            method: .put,
            path: "/api/v1/devices/\(id)",
            body: DeviceUpdateBody(tags: tags)
        )
    }

    /// Soft-delete a device (sets `status = inactive`). Idempotent; calling
    /// twice still returns 200 on the second call.
    @discardableResult
    func unregister(id: String) async throws -> DeviceDeleteResponse {
        guard !id.isEmpty else {
            throw NitropingError.validation("Device id must not be empty")
        }
        return try await transport.send(
            method: .delete,
            path: "/api/v1/devices/\(id)"
        )
    }

    /// Deactivate a device by its provider token (logout flow — you know the
    /// token but not the device id). Wraps `DELETE /api/v1/devices` with a
    /// `{"token": "..."}` body (no id in the path).
    ///
    /// Soft-deletes the matching device (sets `status = inactive`) and
    /// returns its id + status.
    ///
    /// - Throws: `NitropingError.notFound` (404, server code `not_found`)
    ///   when no device with that token belongs to your app.
    @discardableResult
    func deactivateByToken(_ token: String) async throws -> DeviceDeleteResponse {
        guard !token.isEmpty else {
            throw NitropingError.validation("Device token must not be empty")
        }
        return try await transport.send(
            method: .delete,
            path: "/api/v1/devices",
            body: DeviceTokenBody(token: token)
        )
    }
}

private struct DeviceUpdateBody: Encodable {
    let tags: [String]
}

private struct DeviceTokenBody: Encodable {
    let token: String
}
