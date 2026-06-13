//
//  NitropingPayload.swift
//  Nitroping
//
//  Parses an inbound notification's `userInfo` dictionary and surfaces the
//  fields the SDK cares about: deep link, action buttons, tracking ids.
//
//  Available on every platform the package targets, but `UNNotification`
//  itself only exists where `UserNotifications` is available — so the
//  `init(notification:)` convenience is conditionally compiled.
//

import Foundation
#if canImport(UserNotifications)
import UserNotifications
#endif

/// Decoded view of a nitroping push payload.
///
/// All properties are optional — if the payload didn't include a field, the
/// property is `nil` rather than throwing. That keeps a malformed / partial
/// userInfo dict from crashing the notification delegate.
public struct NitropingPayload: Equatable {
    /// Deep link URL to open. Parsed from `data.deep_link` (or top-level
    /// `deep_link`, the form APNs uses since iOS payloads can't nest
    /// arbitrary `data`).
    public let deepLink: URL?

    /// Action buttons declared by the sender. On iOS the host app must
    /// have registered a matching `UNNotificationCategory` for these to
    /// render in the system UI.
    public let actions: [NitropingAction]

    /// Server-side notification id (`notif_...`). Pass back to
    /// `client.events.report` to record opens / clicks.
    public let notificationId: String?

    /// Server-side device id (`dev_...`). Stable per `(app, token)` pair.
    public let deviceId: String?

    /// Platform the server thinks delivered this payload. Useful for
    /// debugging cross-platform issues; on iOS this will be `"ios"`.
    public let platform: String?

    /// Free-form custom data the sender attached (`data: { ... }`). Excludes
    /// the nitroping-reserved keys (which are surfaced as typed properties
    /// above).
    public let data: [String: Any]

    /// True if the payload looks like a nitroping payload at all (i.e. we
    /// found at least a notification id or a deep link). Useful as a quick
    /// guard before reporting events.
    public var isNitropingPayload: Bool {
        notificationId != nil || deepLink != nil || !actions.isEmpty
    }

    // ── Parsing ─────────────────────────────────────────────────────────

    /// Reserved top-level keys we strip out of `data` before exposing it.
    private static let reservedKeys: Set<String> = [
        "aps",
        "nitroping_notification_id",
        "nitroping_device_id",
        "nitroping_platform",
        "deep_link",
        "actions",
        "actions_json"
    ]

    /// Parse a userInfo dict. The `[AnyHashable: Any]` form is what
    /// `UNNotification` hands you; the `[String: Any]` form is what shows up
    /// when you read JSON yourself (e.g. in a Network Extension or on a
    /// background fetch).
    public init(userInfo: [AnyHashable: Any]) {
        // Normalize keys to String so the rest of the parser doesn't have to
        // worry about AnyHashable.
        let normalized: [String: Any] = userInfo.reduce(into: [:]) { acc, kv in
            if let k = kv.key as? String {
                acc[k] = kv.value
            }
        }
        self.init(normalized: normalized)
    }

    /// Parse a String-keyed dict. Use this from contexts where you're
    /// reading the JSON yourself (e.g. a service worker bridge, a test).
    public init(userInfo: [String: Any]) {
        self.init(normalized: userInfo)
    }

    private init(normalized userInfo: [String: Any]) {
        self.notificationId = Self.stringValue(in: userInfo, keys: ["nitroping_notification_id", "notification_id"])
        self.deviceId = Self.stringValue(in: userInfo, keys: ["nitroping_device_id", "device_id"])
        self.platform = Self.stringValue(in: userInfo, keys: ["nitroping_platform", "platform"])
        self.deepLink = Self.parseDeepLink(userInfo: userInfo)
        self.actions = Self.parseActions(userInfo: userInfo)

        var customData = userInfo
        for key in Self.reservedKeys {
            customData.removeValue(forKey: key)
        }
        // Some senders nest under `data` instead of putting custom keys at
        // the top level — merge that in, with top-level winning on conflict.
        if let nested = userInfo["data"] as? [String: Any] {
            for (k, v) in nested where !Self.reservedKeys.contains(k) && customData[k] == nil {
                customData[k] = v
            }
        }
        self.data = customData
    }

    #if canImport(UserNotifications)
    /// Convenience for the common case: build a payload directly from a
    /// `UNNotification`. Available where `UserNotifications` is available
    /// (iOS, macOS, watchOS, tvOS, visionOS).
    public init(notification: UNNotification) {
        self.init(userInfo: notification.request.content.userInfo)
    }
    #endif

    // ── Helpers ─────────────────────────────────────────────────────────

    private static func stringValue(in dict: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let s = dict[key] as? String, !s.isEmpty { return s }
            // Some senders / forwarders coerce the id to a non-string —
            // accept that gracefully.
            if let n = dict[key] as? NSNumber { return n.stringValue }
        }
        // Also try one level of `data.` nesting (APNs custom data + FCM
        // both use this).
        if let nested = dict["data"] as? [String: Any] {
            for key in keys {
                if let s = nested[key] as? String, !s.isEmpty { return s }
                if let n = nested[key] as? NSNumber { return n.stringValue }
            }
        }
        return nil
    }

    private static func parseDeepLink(userInfo: [String: Any]) -> URL? {
        // APNs path: `deep_link` at top level (also accept `url`).
        let topCandidates = ["deep_link", "url", "click_action"]
        for key in topCandidates {
            if let s = userInfo[key] as? String, let url = URL(string: s) { return url }
        }
        // FCM / nested path.
        if let nested = userInfo["data"] as? [String: Any] {
            for key in topCandidates {
                if let s = nested[key] as? String, let url = URL(string: s) { return url }
            }
        }
        return nil
    }

    private static func parseActions(userInfo: [String: Any]) -> [NitropingAction] {
        // APNs path: `actions` is a JSON array. We cast to `[Any]` (not
        // `[[String: Any]]`) so a single malformed entry — a bare string, a
        // dict with the wrong types — doesn't make the whole cast fail and
        // drop the valid actions. `decode` filters element by element.
        if let array = userInfo["actions"] as? [Any] {
            return decode(array: array)
        }
        // FCM / Android path: `actions_json` is a JSON-encoded *string*.
        if let raw = userInfo["actions_json"] as? String,
           let data = raw.data(using: .utf8),
           let array = try? JSONSerialization.jsonObject(with: data) as? [Any] {
            return decode(array: array)
        }
        // Nested under data.
        if let nested = userInfo["data"] as? [String: Any] {
            if let array = nested["actions"] as? [Any] {
                return decode(array: array)
            }
            if let raw = nested["actions_json"] as? String,
               let data = raw.data(using: .utf8),
               let array = try? JSONSerialization.jsonObject(with: data) as? [Any] {
                return decode(array: array)
            }
        }
        return []
    }

    private static func decode(array: [Any]) -> [NitropingAction] {
        array.compactMap { item in
            guard let dict = item as? [String: Any],
                  let id = dict["id"] as? String,
                  let title = dict["title"] as? String else { return nil }
            return NitropingAction(id: id, title: title)
        }
    }

    // ── Equatable ───────────────────────────────────────────────────────
    //
    // `data: [String: Any]` isn't auto-Equatable; we compare via JSON
    // serialisation which is good enough for tests / debugging.

    public static func == (lhs: NitropingPayload, rhs: NitropingPayload) -> Bool {
        lhs.deepLink == rhs.deepLink
            && lhs.actions == rhs.actions
            && lhs.notificationId == rhs.notificationId
            && lhs.deviceId == rhs.deviceId
            && lhs.platform == rhs.platform
            && NSDictionary(dictionary: lhs.data).isEqual(to: rhs.data)
    }
}
