//
//  NitropingClient+Track.swift
//  Nitroping
//
//  `POST /api/v1/track` — the server-side delivery/open/click callback.
//  Returns 202 immediately; the write is absorbed by a background worker.
//  Used by Swift-on-the-server senders, not typically iOS apps.
//

import Foundation

/// Delivery-tracking event reported via `POST /api/v1/track`.
public enum NitropingTrackEvent: String, Codable, Sendable {
    /// Provider confirmed the push reached the device.
    case delivered
    /// User opened the notification.
    case opened
    /// User tapped an action / the notification body.
    case clicked
}

public extension NitropingClient.Track {
    /// Record a delivery event identified by a delivery-log id.
    ///
    /// Wraps `POST /api/v1/track` with body
    /// `{"delivery_log_id": ..., "event": ...}`. Resolves to
    /// `{accepted: true}` on 202.
    @discardableResult
    func record(
        deliveryLogId: String,
        event: NitropingTrackEvent
    ) async throws -> TrackResponse {
        guard !deliveryLogId.isEmpty else {
            throw NitropingError.validation("deliveryLogId must not be empty")
        }
        return try await transport.send(
            method: .post,
            path: "/api/v1/track",
            body: DeliveryLogTrackBody(deliveryLogId: deliveryLogId, event: event)
        )
    }

    /// Record a delivery event identified by notification id + the
    /// device's provider token.
    ///
    /// Wraps `POST /api/v1/track` with body
    /// `{"notification_id": ..., "device_token": ..., "event": ...}`.
    @discardableResult
    func record(
        notificationId: String,
        deviceToken: String,
        event: NitropingTrackEvent
    ) async throws -> TrackResponse {
        guard !notificationId.isEmpty else {
            throw NitropingError.validation("notificationId must not be empty")
        }
        guard !deviceToken.isEmpty else {
            throw NitropingError.validation("deviceToken must not be empty")
        }
        return try await transport.send(
            method: .post,
            path: "/api/v1/track",
            body: TokenTrackBody(
                notificationId: notificationId,
                deviceToken: deviceToken,
                event: event
            )
        )
    }
}

/// Response body for `POST /api/v1/track`.
public struct TrackResponse: Decodable, Equatable, Sendable {
    /// Always `true` on a 202.
    public let accepted: Bool
}

private struct DeliveryLogTrackBody: Encodable {
    let deliveryLogId: String
    let event: NitropingTrackEvent

    enum CodingKeys: String, CodingKey {
        case deliveryLogId = "delivery_log_id"
        case event
    }
}

private struct TokenTrackBody: Encodable {
    let notificationId: String
    let deviceToken: String
    let event: NitropingTrackEvent

    enum CodingKeys: String, CodingKey {
        case notificationId = "notification_id"
        case deviceToken = "device_token"
        case event
    }
}
