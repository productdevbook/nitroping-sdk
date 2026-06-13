/*
 * Devices.kt
 *
 * `np.devices` — wraps `POST /api/v1/devices` and
 * `DELETE /api/v1/devices/:id`.
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
        return wire
    }

    private fun decodeResult(raw: Any?): DeviceResult {
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        val id = map["id"] as? String
            ?: throw NitropingException("Missing `id` in response", code = "decode_error")
        val created = map["created"] as? Boolean ?: false
        return DeviceResult(id = id, created = created)
    }
}
