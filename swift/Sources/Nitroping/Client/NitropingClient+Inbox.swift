//
//  NitropingClient+Inbox.swift
//  Nitroping
//
//  In-app notification-center under `/api/v1/public/inbox`. These endpoints
//  authenticate with a **public** (`pk_`) key — meant to be called from a
//  client app on behalf of a signed-in end user, identified by `userId`
//  (the same opaque id you pass at device registration).
//

import Foundation

public extension NitropingClient.Inbox {
    /// List a user's inbox, newest first.
    ///
    /// Wraps `GET /api/v1/public/inbox?user_id=...`. Optionally filter to
    /// unread items and cap the count.
    ///
    /// - Parameters:
    ///   - userId: the signed-in end user's opaque id.
    ///   - unreadOnly: when `true`, only return unread items.
    ///   - limit: maximum number of items to return.
    func list(
        userId: String,
        unreadOnly: Bool? = nil,
        limit: Int? = nil
    ) async throws -> [InboxItem] {
        guard !userId.isEmpty else {
            throw NitropingError.validation("userId must not be empty")
        }
        var query: [URLQueryItem] = [URLQueryItem(name: "user_id", value: userId)]
        if let unreadOnly {
            query.append(URLQueryItem(name: "unread_only", value: unreadOnly ? "true" : "false"))
        }
        if let limit {
            query.append(URLQueryItem(name: "limit", value: String(limit)))
        }
        let response: InboxListResponse = try await transport.send(
            method: .get,
            path: "/api/v1/public/inbox",
            queryItems: query
        )
        return response.items
    }

    /// Count a user's unread inbox items.
    ///
    /// Wraps `GET /api/v1/public/inbox/unread_count?user_id=...`.
    func unreadCount(userId: String) async throws -> Int {
        guard !userId.isEmpty else {
            throw NitropingError.validation("userId must not be empty")
        }
        let response: UnreadCountResponse = try await transport.send(
            method: .get,
            path: "/api/v1/public/inbox/unread_count",
            queryItems: [URLQueryItem(name: "user_id", value: userId)]
        )
        return response.unreadCount
    }

    /// Mark a single inbox item read. Returns the updated item.
    ///
    /// Wraps `POST /api/v1/public/inbox/:itemId/read` with body
    /// `{"user_id": ...}`.
    @discardableResult
    func markRead(userId: String, itemId: String) async throws -> InboxItem {
        guard !userId.isEmpty else {
            throw NitropingError.validation("userId must not be empty")
        }
        guard !itemId.isEmpty else {
            throw NitropingError.validation("itemId must not be empty")
        }
        return try await transport.send(
            method: .post,
            path: "/api/v1/public/inbox/\(itemId)/read",
            body: InboxUserBody(userId: userId)
        )
    }

    /// Mark every unread inbox item read for a user. Returns the count
    /// updated.
    ///
    /// Wraps `POST /api/v1/public/inbox/read_all` with body
    /// `{"user_id": ...}`.
    @discardableResult
    func markAllRead(userId: String) async throws -> Int {
        guard !userId.isEmpty else {
            throw NitropingError.validation("userId must not be empty")
        }
        let response: MarkAllReadResponse = try await transport.send(
            method: .post,
            path: "/api/v1/public/inbox/read_all",
            body: InboxUserBody(userId: userId)
        )
        return response.markedRead
    }
}

/// One in-app notification-center entry, as returned by the inbox endpoints.
public struct InboxItem: Codable, Sendable, Equatable {
    /// UUID of the inbox item.
    public let id: String
    /// UUID of the originating notification.
    public let notificationId: String
    public let title: String?
    public let body: String?
    /// Arbitrary structured payload attached to the notification.
    public let data: [String: AnyJSONValue]?
    public let deepLink: String?
    /// `true` once the item has been marked read.
    public let read: Bool
    /// ISO-8601 timestamp when it was read, or `nil`.
    public let readAt: String?
    /// ISO-8601 timestamp when the item was created.
    public let insertedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case notificationId = "notification_id"
        case title
        case body
        case data
        case deepLink = "deep_link"
        case read
        case readAt = "read_at"
        case insertedAt = "inserted_at"
    }
}

/// Request body for the inbox mark-read endpoints.
private struct InboxUserBody: Encodable {
    let userId: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
    }
}

/// Response body for `GET /api/v1/public/inbox`.
private struct InboxListResponse: Decodable {
    let items: [InboxItem]

    enum CodingKeys: String, CodingKey {
        case items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.items = try container.decodeIfPresent([InboxItem].self, forKey: .items) ?? []
    }
}

/// Response body for `GET /api/v1/public/inbox/unread_count`.
private struct UnreadCountResponse: Decodable {
    let unreadCount: Int

    enum CodingKeys: String, CodingKey {
        case unreadCount = "unread_count"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.unreadCount = try container.decodeIfPresent(Int.self, forKey: .unreadCount) ?? 0
    }
}

/// Response body for `POST /api/v1/public/inbox/read_all`.
private struct MarkAllReadResponse: Decodable {
    let markedRead: Int

    enum CodingKeys: String, CodingKey {
        case markedRead = "marked_read"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.markedRead = try container.decodeIfPresent(Int.self, forKey: .markedRead) ?? 0
    }
}
