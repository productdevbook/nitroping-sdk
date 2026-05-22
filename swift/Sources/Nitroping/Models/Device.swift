//
//  Device.swift
//  Nitroping
//

import Foundation

/// Platform discriminator on the device-register request body.
public enum DevicePlatform: String, Codable, Sendable, CaseIterable {
    case ios
    case android
    case web
}

/// Request body for `POST /api/v1/devices`.
///
/// Idempotent on `(app, token, userId)` server-side, so calling
/// `register` more than once with the same triple is safe and returns the
/// existing row.
public struct DeviceRegistration: Codable, Equatable, Sendable {
    /// Provider token. For iOS this is the **hex string** form of
    /// `Data` returned by
    /// `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`.
    public let token: String

    /// Platform — picks which provider routes the message (APNs / FCM / Web Push).
    public let platform: DevicePlatform

    /// Opaque tenant-side user identifier. The same user across re-installs
    /// will keep their notifications routed to the latest device by passing
    /// this through on each register.
    public let userId: String?

    /// p256dh key, base64-url encoded. Required when `platform == .web`,
    /// ignored otherwise.
    public let webPushP256dh: String?

    /// auth secret, base64-url encoded. Required when `platform == .web`.
    public let webPushAuth: String?

    /// Free-form metadata (app version, locale, etc.). Surfaces in the
    /// dashboard device-list view; never gated on a value.
    public let metadata: [String: String]?

    public init(
        platform: DevicePlatform,
        token: String,
        userId: String? = nil,
        webPushP256dh: String? = nil,
        webPushAuth: String? = nil,
        metadata: [String: String]? = nil
    ) {
        self.platform = platform
        self.token = token
        self.userId = userId
        self.webPushP256dh = webPushP256dh
        self.webPushAuth = webPushAuth
        self.metadata = metadata
    }

    enum CodingKeys: String, CodingKey {
        case token
        case platform
        case userId = "user_id"
        case webPushP256dh = "web_push_p256dh"
        case webPushAuth = "web_push_auth"
        case metadata
    }
}

/// Response body for `POST /api/v1/devices`. Same shape on first
/// register vs. idempotent replay — `created == false` on replay.
public struct DeviceRegistrationResponse: Codable, Equatable, Sendable {
    /// Server-assigned device id. Persist this; it's what you'll see in
    /// `NitropingPayload.deviceId` on inbound notifications.
    public let id: String

    /// True on first-register, false on idempotent replay.
    public let created: Bool
}

/// Response body for `DELETE /api/v1/devices/:id`.
public struct DeviceDeleteResponse: Codable, Equatable, Sendable {
    public let id: String
    /// Server soft-deletes; the row stays with `status = "inactive"` so
    /// historical delivery rows still resolve.
    public let status: String
}
