//
//  NitropingClient+Public.swift
//  Nitroping
//
//  `GET /api/v1/public/apps/:id/vapid` — exposes an app's VAPID public
//  key so browser code can call `pushManager.subscribe`. No auth is
//  required (VAPID public keys are public by definition); sending the
//  Authorization header anyway is harmless.
//

import Foundation

public extension NitropingClient.PublicAPI {
    /// Fetch the app's VAPID public key for Web Push subscription.
    ///
    /// Wraps `GET /api/v1/public/apps/:id/vapid`, which returns
    /// `{"public_key": "..."}`. Throws `NitropingError.notFound` (404)
    /// with code `"vapid_not_configured"` when the app has no VAPID
    /// bundle linked.
    ///
    /// - Parameter appId: the app id whose key to fetch.
    /// - Returns: the VAPID public key string.
    func vapidPublicKey(appId: String) async throws -> String {
        guard !appId.isEmpty else {
            throw NitropingError.validation("appId must not be empty")
        }
        let response: VapidResponse = try await transport.send(
            method: .get,
            path: "/api/v1/public/apps/\(appId)/vapid"
        )
        return response.publicKey
    }
}

/// Response body for `GET /api/v1/public/apps/:id/vapid`.
public struct VapidResponse: Decodable, Equatable, Sendable {
    /// The app's VAPID public key (base64-url).
    public let publicKey: String

    enum CodingKeys: String, CodingKey {
        case publicKey = "public_key"
    }
}
