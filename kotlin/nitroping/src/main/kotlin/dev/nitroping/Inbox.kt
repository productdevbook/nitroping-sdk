/*
 * Inbox.kt
 *
 * `np.inbox` — the in-app notification center under
 * `/api/v1/public/inbox`.
 *
 * These endpoints authenticate with a **public** (`pk_`) key — they're
 * meant to be called from a client app on behalf of a signed-in end user,
 * identified by `userId` (the same opaque id you pass at device
 * registration).
 *
 * Wire shapes:
 *
 *   GET  /api/v1/public/inbox?user_id=..&unread_only=..&limit=..
 *        → { "items": [ { id, notification_id, title?, body?, data?,
 *                          deep_link?, read, read_at?, inserted_at? } ] }
 *   GET  /api/v1/public/inbox/unread_count?user_id=..
 *        → { "unread_count": N }
 *   POST /api/v1/public/inbox/{itemId}/read   body { "user_id": ".." }
 *        → { id, notification_id, ..., read: true }
 *   POST /api/v1/public/inbox/read_all        body { "user_id": ".." }
 *        → { "marked_read": N }
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport

public class InboxClient internal constructor(private val transport: HttpTransport) {
    /**
     * List a user's inbox, newest first.
     *
     * @param userId opaque tenant-side user id.
     * @param unreadOnly when `true`, return only unread items.
     * @param limit cap the number of items returned.
     */
    @Suppress("UNCHECKED_CAST")
    public suspend fun list(
        userId: String,
        unreadOnly: Boolean? = null,
        limit: Int? = null,
    ): List<InboxItem> {
        require(userId.isNotEmpty()) { "userId must not be empty" }
        val query = LinkedHashMap<String, Any?>()
        query["user_id"] = userId
        if (unreadOnly != null) query["unread_only"] = unreadOnly
        if (limit != null) query["limit"] = limit
        val raw = transport.request("GET", "/api/v1/public/inbox", query = query)
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape for inbox list", code = "decode_error")
        val items = map["items"] as? List<*> ?: emptyList<Any?>()
        return items.mapNotNull { (it as? Map<*, *>)?.let(::fromWire) }
    }

    /** Count a user's unread inbox items. */
    public suspend fun unreadCount(userId: String): Int {
        require(userId.isNotEmpty()) { "userId must not be empty" }
        val raw = transport.request(
            "GET",
            "/api/v1/public/inbox/unread_count",
            query = mapOf("user_id" to userId),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return (map["unread_count"] as? Number)?.toInt() ?: 0
    }

    /** Mark a single inbox item read. */
    public suspend fun markRead(userId: String, itemId: String): InboxItem {
        require(userId.isNotEmpty()) { "userId must not be empty" }
        require(itemId.isNotEmpty()) { "itemId must not be empty" }
        val raw = transport.request(
            method = "POST",
            path = "/api/v1/public/inbox/$itemId/read",
            body = mapOf("user_id" to userId),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return fromWire(map)
    }

    /** Mark every unread inbox item read for a user. Returns the count updated. */
    public suspend fun markAllRead(userId: String): Int {
        require(userId.isNotEmpty()) { "userId must not be empty" }
        val raw = transport.request(
            method = "POST",
            path = "/api/v1/public/inbox/read_all",
            body = mapOf("user_id" to userId),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return (map["marked_read"] as? Number)?.toInt() ?: 0
    }

    @Suppress("UNCHECKED_CAST")
    private fun fromWire(w: Map<*, *>): InboxItem = InboxItem(
        id = w["id"] as? String
            ?: throw NitropingException("Missing `id` in inbox item", code = "decode_error"),
        notificationId = w["notification_id"] as? String
            ?: throw NitropingException("Missing `notification_id` in inbox item", code = "decode_error"),
        title = w["title"] as? String,
        body = w["body"] as? String,
        data = w["data"] as? Map<String, Any?>,
        deepLink = w["deep_link"] as? String,
        read = w["read"] as? Boolean ?: false,
        readAt = w["read_at"] as? String,
        insertedAt = w["inserted_at"] as? String,
    )
}
