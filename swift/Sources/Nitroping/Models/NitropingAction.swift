//
//  NitropingAction.swift
//  Nitroping
//

import Foundation

/// One action button on a notification. The server's `actions: [{id, title}]`
/// array round-trips through APNs (as a top-level `actions` JSON array on
/// iOS) and FCM (as an `actions_json` string on Android).
///
/// On iOS the host app must register a `UNNotificationCategory` whose
/// `UNNotificationAction.identifier` matches `id`; see README for an example.
public struct NitropingAction: Codable, Equatable, Sendable, Hashable {
    /// Stable identifier — matches `response.actionIdentifier` when the user
    /// taps the button. Treat as opaque; the server picks it.
    public let id: String

    /// Localized button label. The server may localize per-device; the SDK
    /// only passes it through.
    public let title: String

    public init(id: String, title: String) {
        self.id = id
        self.title = title
    }
}
