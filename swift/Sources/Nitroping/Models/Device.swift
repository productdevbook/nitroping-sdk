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

/// APNs environment an iOS token belongs to. Apple's push host is
/// environment-specific (`api.sandbox.push.apple.com` vs
/// `api.push.apple.com`) and a token can't be inspected to tell which,
/// so the app must report it: `.sandbox` for a development build (Xcode
/// run / debug), `.production` for App Store or TestFlight. Ignored for
/// non-iOS platforms.
public enum APNSEnvironment: String, Codable, Sendable, CaseIterable {
    case sandbox
    case production
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

    /// Segmentation labels used by `NotificationTarget.tags([...])`.
    /// Trimmed + deduped server-side (max 32 tags / 64 bytes each).
    public let tags: [String]?

    /// APNs environment for an iOS token. Set `.sandbox` for development
    /// builds and `.production` for App Store / TestFlight so the server
    /// routes to the matching Apple host. Ignored for non-iOS platforms.
    public let environment: APNSEnvironment?

    /// IANA timezone for this device (e.g. `"Europe/Istanbul"`). Used for
    /// timezone-aware scheduled / recurring sends. Optional.
    public let timezone: String?

    public init(
        platform: DevicePlatform,
        token: String,
        userId: String? = nil,
        webPushP256dh: String? = nil,
        webPushAuth: String? = nil,
        metadata: [String: String]? = nil,
        tags: [String]? = nil,
        environment: APNSEnvironment? = nil,
        timezone: String? = nil
    ) {
        self.platform = platform
        self.token = token
        self.userId = userId
        self.webPushP256dh = webPushP256dh
        self.webPushAuth = webPushAuth
        self.metadata = metadata
        self.tags = tags
        self.environment = environment
        self.timezone = timezone
    }

    enum CodingKeys: String, CodingKey {
        case token
        case platform
        case userId = "user_id"
        case webPushP256dh = "web_push_p256dh"
        case webPushAuth = "web_push_auth"
        case metadata
        case tags
        case environment
        case timezone
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

/// Response body for `PUT /api/v1/devices/:id` (update). Echoes the
/// device's tags after the change.
public struct DeviceUpdateResponse: Codable, Equatable, Sendable {
    public let id: String
    /// The device's tags after the update.
    public let tags: [String]
}

/// Response body for `DELETE /api/v1/devices/:id`.
public struct DeviceDeleteResponse: Codable, Equatable, Sendable {
    public let id: String
    /// Server soft-deletes; the row stays with `status = "inactive"` so
    /// historical delivery rows still resolve.
    public let status: String
}
