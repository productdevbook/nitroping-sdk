/*
 * Notifications.kt
 *
 * `np.notifications` — wraps `POST /api/v1/notifications` and
 * `GET /api/v1/notifications/:id`.
 *
 * Mostly used from Kotlin-on-the-server (Ktor, Spring); Android apps
 * receive notifications, they don't typically send them.
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport

public class Notifications internal constructor(private val transport: HttpTransport) {
    /**
     * Enqueue a notification.
     *
     * Returns [NotificationResult] on `201 Created`. On non-2xx the SDK
     * throws [ApiException] carrying the server's `code`, `message`, and
     * (for validation failures) the per-field `details` map.
     */
    public suspend fun send(input: SendRequest): NotificationResult {
        val headers: Map<String, String> = input.idempotencyKey
            ?.let { mapOf("Idempotency-Key" to it) }
            ?: emptyMap()
        val raw = transport.request(
            method = "POST",
            path = "/api/v1/notifications",
            body = toWire(input),
            headers = headers,
        )
        return decodeResult(raw)
    }

    /**
     * Fetch a previously enqueued notification by id.
     *
     * Returns the raw JSON tree (`Map<String, Any?>`) so callers can read
     * the full row including counters (`total_sent`, `total_delivered`,
     * etc.) without forcing the SDK to model every future field.
     */
    @Suppress("UNCHECKED_CAST")
    public suspend fun get(id: String): Map<String, Any?> {
        require(id.isNotEmpty()) { "Notification id must not be empty" }
        val raw = transport.request("GET", "/api/v1/notifications/$id")
        return (raw as? Map<String, Any?>)
            ?: throw NitropingException("Unexpected response shape for GET notification", code = "decode_error")
    }

    /**
     * Cancel a queued or scheduled notification.
     *
     * Returns `{ id, status = "canceled" }`. Throws [ApiException] with
     * `code = "not_found"` if the id doesn't belong to your app, or
     * `code = "cannot_cancel"` (409) if the notification already reached a
     * terminal state (sent / failed / partial / canceled).
     */
    public suspend fun cancel(id: String): NotificationCancelResult {
        require(id.isNotEmpty()) { "Notification id must not be empty" }
        val raw = transport.request("DELETE", "/api/v1/notifications/$id")
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return NotificationCancelResult(
            id = map["id"] as? String
                ?: throw NitropingException("Missing `id` in response", code = "decode_error"),
            status = map["status"] as? String
                ?: throw NitropingException("Missing `status` in response", code = "decode_error"),
        )
    }

    /** camelCase → snake_case + drop `null`s, matching the JS SDK's `toWire`. */
    private fun toWire(input: SendRequest): Map<String, Any?> {
        val wire = LinkedHashMap<String, Any?>()
        input.title?.let { wire["title"] = it }
        input.body?.let { wire["body"] = it }
        input.template?.let { wire["template"] = it }
        input.vars?.let { wire["vars"] = it }
        input.data?.let { wire["data"] = it }
        input.icon?.let { wire["icon"] = it }
        input.image?.let { wire["image"] = it }
        input.clickAction?.let { wire["click_action"] = it }
        input.deepLink?.let { wire["deep_link"] = it }
        input.actions?.let { list ->
            wire["actions"] = list.map { a ->
                val m = LinkedHashMap<String, Any?>()
                m["id"] = a.id
                m["title"] = a.title
                if (a.icon != null) m["icon"] = a.icon
                m
            }
        }
        input.apnsCategory?.let { wire["apns_category"] = it }
        input.scheduledAt?.let { wire["scheduled_at"] = it }
        input.expiresAt?.let { wire["expires_at"] = it }
        input.recurrence?.let { wire["recurrence"] = it }
        input.recurrenceTz?.let { wire["recurrence_tz"] = it }
        input.recurrenceUntil?.let { wire["recurrence_until"] = it }
        input.emailTo?.let { wire["email_to"] = it }
        wire["target"] = targetToWire(input.target)
        return wire
    }

    private fun targetToWire(target: Target): Map<String, Any?> = when (target) {
        Target.All -> mapOf("all" to true)
        is Target.DeviceIds -> mapOf("device_ids" to target.ids)
        is Target.UserIds -> mapOf("user_ids" to target.ids)
        is Target.Tags -> mapOf("tags" to target.tags)
        is Target.Segment -> mapOf(
            "segment" to mapOf(
                "match" to target.match,
                "conditions" to target.conditions.map { c ->
                    val m = LinkedHashMap<String, Any?>()
                    m["field"] = c.field
                    m["op"] = c.op
                    if (c.value != null) m["value"] = c.value
                    m
                },
            ),
        )
    }

    private fun decodeResult(raw: Any?): NotificationResult {
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        val id = map["id"] as? String
            ?: throw NitropingException("Missing `id` in response", code = "decode_error")
        val status = map["status"] as? String
            ?: throw NitropingException("Missing `status` in response", code = "decode_error")
        return NotificationResult(id = id, status = status)
    }
}
