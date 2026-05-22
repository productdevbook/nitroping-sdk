//
//  Notification.swift
//  Nitroping
//

import Foundation

/// Target selector for `POST /api/v1/notifications`. Exactly one branch
/// must be set; the SDK encodes it directly into the request body.
public enum NotificationTarget: Equatable, Sendable {
    /// Broadcast to every active device of the app.
    case all
    /// Send to a specific list of device ids (`dev_...`).
    case deviceIds([String])
    /// Send to every device bound to the given user ids.
    case userIds([String])
}

extension NotificationTarget: Encodable {
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: GenericKey.self)
        switch self {
        case .all:
            try container.encode(true, forKey: GenericKey(stringValue: "all")!)
        case .deviceIds(let ids):
            try container.encode(ids, forKey: GenericKey(stringValue: "device_ids")!)
        case .userIds(let ids):
            try container.encode(ids, forKey: GenericKey(stringValue: "user_ids")!)
        }
    }

    private struct GenericKey: CodingKey {
        let stringValue: String
        let intValue: Int? = nil
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }
}

/// Request body for `POST /api/v1/notifications`. Used by Swift-on-the-server
/// callers; not the typical path from an iOS app, but symmetric with the
/// TypeScript SDK so that a Vapor backend can drive nitroping the same way.
public struct CreateNotification: Encodable, Sendable {
    public let title: String?
    public let body: String?
    public let target: NotificationTarget
    public let deepLink: URL?
    public let actions: [NitropingAction]?
    public let data: [String: String]?
    public let scheduledAt: Date?

    public init(
        title: String?,
        body: String?,
        target: NotificationTarget,
        deepLink: URL? = nil,
        actions: [NitropingAction]? = nil,
        data: [String: String]? = nil,
        scheduledAt: Date? = nil
    ) {
        self.title = title
        self.body = body
        self.target = target
        self.deepLink = deepLink
        self.actions = actions
        self.data = data
        self.scheduledAt = scheduledAt
    }

    enum CodingKeys: String, CodingKey {
        case title
        case body
        case target
        case deepLink = "deep_link"
        case actions
        case data
        case scheduledAt = "scheduled_at"
    }
}

/// Response body for `POST /api/v1/notifications`.
public struct CreateNotificationResponse: Decodable, Equatable, Sendable {
    /// Server-assigned id (`notif_...`).
    public let id: String
    /// Initial status — usually `"queued"`; `"scheduled"` if `scheduledAt`
    /// is in the future.
    public let status: String
}

// MARK: - Engagement events

/// The two kinds of engagement we report back to nitroping.
public enum NitropingEventType: String, Codable, Sendable {
    /// User tapped the notification body (or the default action).
    case opened
    /// User tapped one of the action buttons. `actionId` should be set.
    case clicked
}
