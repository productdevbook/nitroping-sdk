//
//  NitropingClient+Devices.swift
//  Nitroping
//
//  `POST /api/v1/devices` + `DELETE /api/v1/devices/:id`.
//

import Foundation

public extension NitropingClient.Devices {
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
}
