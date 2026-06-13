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
    /// Send to every device carrying any of the given tags.
    case tags([String])
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
        case .tags(let tags):
            try container.encode(tags, forKey: GenericKey(stringValue: "tags")!)
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
    /// Template slug — alternative to `title + body` (Pro tier). Mixing
    /// the two is a 422 server-side.
    public let template: String?
    /// Variables interpolated into the template. Wire key `vars`.
    public let templateVars: [String: String]?
    public let deepLink: URL?
    /// Legacy fallback URL opened on tap. Prefer `deepLink`.
    public let clickAction: String?
    /// Notification icon URL.
    public let icon: String?
    /// Notification image URL.
    public let image: String?
    public let actions: [NitropingAction]?
    public let data: [String: String]?
    public let scheduledAt: Date?
    /// After this instant the notification is dropped rather than sent.
    public let expiresAt: Date?

    public init(
        title: String?,
        body: String?,
        target: NotificationTarget,
        template: String? = nil,
        templateVars: [String: String]? = nil,
        deepLink: URL? = nil,
        clickAction: String? = nil,
        icon: String? = nil,
        image: String? = nil,
        actions: [NitropingAction]? = nil,
        data: [String: String]? = nil,
        scheduledAt: Date? = nil,
        expiresAt: Date? = nil
    ) {
        self.title = title
        self.body = body
        self.target = target
        self.template = template
        self.templateVars = templateVars
        self.deepLink = deepLink
        self.clickAction = clickAction
        self.icon = icon
        self.image = image
        self.actions = actions
        self.data = data
        self.scheduledAt = scheduledAt
        self.expiresAt = expiresAt
    }

    enum CodingKeys: String, CodingKey {
        case title
        case body
        case target
        case template
        case templateVars = "vars"
        case deepLink = "deep_link"
        case clickAction = "click_action"
        case icon
        case image
        case actions
        case data
        case scheduledAt = "scheduled_at"
        case expiresAt = "expires_at"
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
