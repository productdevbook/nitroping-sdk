//
//  NitropingClient+Events.swift
//  Nitroping
//
//  `POST /api/v1/events` — engagement tracking. No API key required; the
//  `(notification_id, device_id)` pair is the secret (both are opaque
//  server-minted UUIDs the client only sees if it received a real
//  notification).
//

import Foundation

public extension NitropingClient.Events {
    /// Report a user-triggered event on an inbound notification.
    ///
    /// Call this from your `UNUserNotificationCenter` delegate's
    /// `didReceive response:` handler. The `notificationId` and `deviceId`
    /// come straight off `NitropingPayload(notification:)`.
    ///
    /// - Parameters:
    ///   - notificationId: server-minted id (`notif_...`).
    ///   - deviceId: server-minted id (`dev_...`).
    ///   - type: `.opened` for tapping the body / default action, `.clicked`
    ///           for tapping an action button.
    ///   - actionId: the action's `id` when `type == .clicked`.
    ///   - happenedAt: override the server-side timestamp; defaults to
    ///                 server-now if `nil`.
    func report(
        notificationId: String,
        deviceId: String,
        type: NitropingEventType,
        actionId: String? = nil,
        happenedAt: Date? = nil
    ) async throws {
        guard !notificationId.isEmpty else {
            throw NitropingError.validation("notificationId must not be empty")
        }
        guard !deviceId.isEmpty else {
            throw NitropingError.validation("deviceId must not be empty")
        }
        let body = EventBody(
            notificationId: notificationId,
            deviceId: deviceId,
            type: type,
            actionId: actionId,
            happenedAt: happenedAt
        )
        let _: EmptyResponse = try await transport.send(
            method: .post,
            path: "/api/v1/events",
            body: body
        )
    }
}

private struct EventBody: Encodable {
    let notificationId: String
    let deviceId: String
    let type: NitropingEventType
    let actionId: String?
    let happenedAt: Date?

    enum CodingKeys: String, CodingKey {
        case notificationId = "notification_id"
        case deviceId = "device_id"
        case type
        case actionId = "action_id"
        case happenedAt = "happened_at"
    }
}
