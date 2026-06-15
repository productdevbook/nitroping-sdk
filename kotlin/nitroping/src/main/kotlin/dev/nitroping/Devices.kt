/*
 * Devices.kt
 *
 * `np.devices` — wraps `GET /api/v1/devices`, `POST /api/v1/devices`,
 * `PUT /api/v1/devices/:id`, `DELETE /api/v1/devices/:id`, and
 * `DELETE /api/v1/devices` (deactivate by token).
 *
 * On Android use this from the FCM token-refresh path to attach the device
 * to a `userId`. On a Kotlin backend use it to register pre-issued device
 * tokens you've collected via your own provisioning flow.
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport

public class Devices internal constructor(private val transport: HttpTransport) {
    /**
     * Register (or update) a device with the secret API key.
     *
     * Idempotent on `(app, token, userId)`. Returns [DeviceResult] with
     * `created: true` when a new row was inserted, `created: false` when
     * an existing device matched.
     */
    public suspend fun register(input: DeviceRequest): DeviceResult {
        val path = if (transport.authScheme == "Public") "/api/v1/public/devices" else "/api/v1/devices"
        val raw = transport.request(
            method = "POST",
            path = path,
            body = toWire(input),
        )
        return decodeResult(raw)
    }

    /**
     * List devices (secret API key). Wraps `GET /api/v1/devices`.
     *
     * Pass [userId] to fetch one end-user's registered devices; [platform]
     * and [status] narrow further; [page] / [pageSize] paginate (the server
     * caps `pageSize` at 100). The push token is **never** returned —
     * [DeviceSummary] carries only metadata.
     *
     * Returns [ListDevicesResult] with the page of [DeviceSummary] rows and
     * the [total][ListDevicesResult.total] count across all pages.
     */
    public suspend fun list(
        userId: String? = null,
        platform: Platform? = null,
        status: String? = null,
        page: Int? = null,
        pageSize: Int? = null,
    ): ListDevicesResult {
        val query = LinkedHashMap<String, Any?>()
        if (userId != null) query["user_id"] = userId
        if (platform != null) query["platform"] = platform.wire
        if (status != null) query["status"] = status
        if (page != null) query["page"] = page
        if (pageSize != null) query["page_size"] = pageSize
        val raw = transport.request("GET", "/api/v1/devices", query = query)
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape for device list", code = "decode_error")
        val data = (map["data"] as? List<*> ?: emptyList<Any?>())
            .mapNotNull { (it as? Map<*, *>)?.let(::fromWire) }
        val total = (map["total"] as? Number)?.toInt() ?: data.size
        return ListDevicesResult(data = data, total = total)
    }

    /**
     * Deactivate a device (soft delete — sets `status = inactive`).
     *
     * Returns `{ id, status = "inactive" }`. Throws [ApiException] with
     * `code = "not_found"` if the id doesn't belong to your app.
     */
    public suspend fun deactivate(id: String): DeviceDeactivateResult {
        require(id.isNotEmpty()) { "Device id must not be empty" }
        val raw = transport.request("DELETE", "/api/v1/devices/$id")
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return DeviceDeactivateResult(
            id = map["id"] as? String
                ?: throw NitropingException("Missing `id` in response", code = "decode_error"),
            status = map["status"] as? String
                ?: throw NitropingException("Missing `status` in response", code = "decode_error"),
        )
    }

    /**
     * Deactivate a device by its provider token (logout flow — you know the
     * token but not the device id). Wraps `DELETE /api/v1/devices` with a
     * `{ token }` body.
     *
     * Returns `{ id, status = "inactive" }`. Throws [ApiException] with
     * `code = "not_found"` when no device with that token belongs to your app.
     */
    public suspend fun deactivateByToken(token: String): DeviceDeactivateResult {
        require(token.isNotEmpty()) { "Device token must not be empty" }
        val raw = transport.request(
            method = "DELETE",
            path = "/api/v1/devices",
            body = mapOf("token" to token),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return DeviceDeactivateResult(
            id = map["id"] as? String
                ?: throw NitropingException("Missing `id` in response", code = "decode_error"),
            status = map["status"] as? String
                ?: throw NitropingException("Missing `status` in response", code = "decode_error"),
        )
    }

    /**
     * Update a device — today only its `tags`. Wraps `PUT /api/v1/devices/:id`.
     *
     * Pass an empty list to clear all tags. Returns `{ id, tags }` with the
     * tags as they stand after the update. Throws [ApiException] with
     * `code = "not_found"` if the id doesn't belong to your app.
     */
    @Suppress("UNCHECKED_CAST")
    public suspend fun update(id: String, tags: List<String>): DeviceUpdateResult {
        require(id.isNotEmpty()) { "Device id must not be empty" }
        val raw = transport.request(
            method = "PUT",
            path = "/api/v1/devices/$id",
            body = mapOf("tags" to tags),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return DeviceUpdateResult(
            id = map["id"] as? String
                ?: throw NitropingException("Missing `id` in response", code = "decode_error"),
            tags = (map["tags"] as? List<*>)?.map { it as String } ?: emptyList(),
        )
    }

    private fun toWire(input: DeviceRequest): Map<String, Any?> {
        val wire = LinkedHashMap<String, Any?>()
        wire["token"] = input.token
        wire["platform"] = input.platform.wire
        input.userId?.let { wire["user_id"] = it }
        input.webPushP256dh?.let { wire["web_push_p256dh"] = it }
        input.webPushAuth?.let { wire["web_push_auth"] = it }
        input.metadata?.let { wire["metadata"] = it }
        input.tags?.let { wire["tags"] = it }
        input.environment?.let { wire["environment"] = it }
        input.timezone?.let { wire["timezone"] = it }
        return wire
    }

    private fun fromWire(w: Map<*, *>): DeviceSummary = DeviceSummary(
        id = w["id"] as? String
            ?: throw NitropingException("Missing `id` in device summary", code = "decode_error"),
        userId = w["user_id"] as? String,
        platform = (w["platform"] as? String)?.let(Platform::fromWire)
            ?: throw NitropingException("Missing or unknown `platform` in device summary", code = "decode_error"),
        status = w["status"] as? String
            ?: throw NitropingException("Missing `status` in device summary", code = "decode_error"),
        tags = (w["tags"] as? List<*>)?.mapNotNull { it as? String } ?: emptyList(),
        timezone = w["timezone"] as? String,
        apnsEnvironment = w["apns_environment"] as? String,
        lastSeenAt = w["last_seen_at"] as? String,
        insertedAt = w["inserted_at"] as? String
            ?: throw NitropingException("Missing `inserted_at` in device summary", code = "decode_error"),
    )

    private fun decodeResult(raw: Any?): DeviceResult {
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        val id = map["id"] as? String
            ?: throw NitropingException("Missing `id` in response", code = "decode_error")
        val created = map["created"] as? Boolean ?: false
        return DeviceResult(id = id, created = created)
    }
}
