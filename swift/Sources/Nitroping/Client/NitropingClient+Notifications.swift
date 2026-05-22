//
//  NitropingClient+Notifications.swift
//  Nitroping
//
//  `POST /api/v1/notifications` + `GET /api/v1/notifications/:id`. Mostly
//  used from Swift-on-the-server (Vapor / Hummingbird) — iOS apps don't
//  typically *send* pushes, they receive them.
//

import Foundation

public extension NitropingClient.Notifications {
    /// Enqueue a notification for delivery.
    ///
    /// - Parameters:
    ///   - notification: title/body/target payload.
    ///   - idempotencyKey: optional. If set, the same key + same body
    ///     replays the original response without a duplicate enqueue;
    ///     different bodies under the same key fail with a 409 envelope
    ///     surfaced as `NitropingError.server(status: 409, ...)`.
    @discardableResult
    func create(
        _ notification: CreateNotification,
        idempotencyKey: String? = nil
    ) async throws -> CreateNotificationResponse {
        try await transport.send(
            method: .post,
            path: "/api/v1/notifications",
            body: notification,
            idempotencyKey: idempotencyKey
        )
    }

    /// Fetch a notification's current status + counters.
    func get(id: String) async throws -> NotificationDetail {
        guard !id.isEmpty else {
            throw NitropingError.validation("Notification id must not be empty")
        }
        return try await transport.send(
            method: .get,
            path: "/api/v1/notifications/\(id)"
        )
    }
}

/// Server response for `GET /api/v1/notifications/:id`. Many fields are
/// surfaced as optionals because they're only populated once the row has
/// progressed through the fanout / send workers.
public struct NotificationDetail: Decodable, Equatable, Sendable {
    public let id: String
    public let status: String
    public let title: String?
    public let body: String?
    public let deepLink: String?
    public let actions: [NitropingAction]?
    public let counters: Counters?

    public struct Counters: Decodable, Equatable, Sendable {
        public let totalTargets: Int?
        public let totalSent: Int?
        public let totalDelivered: Int?
        public let totalFailed: Int?
        public let totalOpened: Int?
        public let totalClicked: Int?

        enum CodingKeys: String, CodingKey {
            case totalTargets = "total_targets"
            case totalSent = "total_sent"
            case totalDelivered = "total_delivered"
            case totalFailed = "total_failed"
            case totalOpened = "total_opened"
            case totalClicked = "total_clicked"
        }
    }

    enum CodingKeys: String, CodingKey {
        case id
        case status
        case title
        case body
        case deepLink = "deep_link"
        case actions
        case counters
    }
}
