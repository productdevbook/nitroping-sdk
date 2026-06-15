//
//  Notification.swift
//  Nitroping
//

import Foundation

/// Value carried by a `SegmentCondition`. The wire shape allows a string,
/// a number, or an array of those (and is omitted entirely for operators
/// like `exists` that take no value). Encodable so it round-trips into the
/// request body; reuse this rather than `AnyJSONValue` (which is decode-only).
public enum SegmentValue: Encodable, Sendable, Equatable {
    case string(String)
    case int(Int)
    case double(Double)
    case stringArray([String])
    case intArray([Int])

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let v):
            try container.encode(v)
        case .int(let v):
            try container.encode(v)
        case .double(let v):
            try container.encode(v)
        case .stringArray(let v):
            try container.encode(v)
        case .intArray(let v):
            try container.encode(v)
        }
    }
}

/// A single audience-segment condition over device fields + metadata.
///
/// `field` is one of `"platform"`, `"user_id"`, `"timezone"`, `"tag"`, or
/// `"metadata.<key>"`. `op` is one of `"eq"`, `"neq"`, `"in"`, `"exists"`,
/// `"contains"`, `"gt"`, `"lt"`. `value` is a string / number / array
/// depending on `op` (omit for `exists`).
public struct SegmentCondition: Encodable, Sendable, Equatable {
    public let field: String
    public let op: String
    public let value: SegmentValue?

    public init(field: String, op: String, value: SegmentValue? = nil) {
        self.field = field
        self.op = op
        self.value = value
    }

    enum CodingKeys: String, CodingKey {
        case field
        case op
        case value
    }
}

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
    /// Match devices by an audience segment. `match` is `"all"` (AND, the
    /// default) or `"any"` (OR) over `conditions`.
    case segment(match: String, conditions: [SegmentCondition])
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
        case .segment(let match, let conditions):
            var segment = container.nestedContainer(
                keyedBy: SegmentKey.self,
                forKey: GenericKey(stringValue: "segment")!
            )
            try segment.encode(match, forKey: .match)
            try segment.encode(conditions, forKey: .conditions)
        }
    }

    private struct GenericKey: CodingKey {
        let stringValue: String
        let intValue: Int? = nil
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
    }

    private enum SegmentKey: String, CodingKey {
        case match
        case conditions
    }
}

public extension NotificationTarget {
    /// Convenience for the common `match: "all"` segment.
    static func segment(_ conditions: [SegmentCondition]) -> NotificationTarget {
        .segment(match: "all", conditions: conditions)
    }
}

public extension SegmentCondition {
    /// `field == value` (string).
    static func equals(_ field: String, _ value: String) -> SegmentCondition {
        SegmentCondition(field: field, op: "eq", value: .string(value))
    }

    /// `field != value` (string).
    static func notEquals(_ field: String, _ value: String) -> SegmentCondition {
        SegmentCondition(field: field, op: "neq", value: .string(value))
    }

    /// `field` is one of `values`.
    static func isIn(_ field: String, _ values: [String]) -> SegmentCondition {
        SegmentCondition(field: field, op: "in", value: .stringArray(values))
    }

    /// `field` is present (no value).
    static func exists(_ field: String) -> SegmentCondition {
        SegmentCondition(field: field, op: "exists", value: nil)
    }

    /// `field` contains `value` (e.g. a tag).
    static func contains(_ field: String, _ value: String) -> SegmentCondition {
        SegmentCondition(field: field, op: "contains", value: .string(value))
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
    /// iOS only. Sets `aps.category` verbatim so an app that registered a
    /// matching `UNNotificationCategory` (e.g. `"order_refund"`) renders the
    /// action buttons. Overrides the server-minted category for this message.
    /// Wire key `apns_category`.
    public let apnsCategory: String?
    public let data: [String: String]?
    public let scheduledAt: Date?
    /// After this instant the notification is dropped rather than sent.
    public let expiresAt: Date?
    /// Cron expression for a recurring send (Pro tier). Mutually exclusive
    /// with a one-shot `scheduledAt`.
    public let recurrence: String?
    /// IANA timezone the `recurrence` cron is evaluated in (default
    /// `Etc/UTC`). Wire key `recurrence_tz`.
    public let recurrenceTz: String?
    /// ISO-8601 instant after which the recurrence stops firing. Wire key
    /// `recurrence_until`.
    public let recurrenceUntil: String?
    /// Email recipients for the email channel. Wire key `email_to`.
    public let emailTo: [String]?

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
        apnsCategory: String? = nil,
        data: [String: String]? = nil,
        scheduledAt: Date? = nil,
        expiresAt: Date? = nil,
        recurrence: String? = nil,
        recurrenceTz: String? = nil,
        recurrenceUntil: String? = nil,
        emailTo: [String]? = nil
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
        self.apnsCategory = apnsCategory
        self.data = data
        self.scheduledAt = scheduledAt
        self.expiresAt = expiresAt
        self.recurrence = recurrence
        self.recurrenceTz = recurrenceTz
        self.recurrenceUntil = recurrenceUntil
        self.emailTo = emailTo
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
        case apnsCategory = "apns_category"
        case data
        case scheduledAt = "scheduled_at"
        case expiresAt = "expires_at"
        case recurrence
        case recurrenceTz = "recurrence_tz"
        case recurrenceUntil = "recurrence_until"
        case emailTo = "email_to"
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
