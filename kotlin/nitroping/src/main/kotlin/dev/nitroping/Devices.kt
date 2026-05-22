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
        val raw = transport.request(
            method = "POST",
            path = "/api/v1/devices",
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

    private fun toWire(input: DeviceRequest): Map<String, Any?> {
        val wire = LinkedHashMap<String, Any?>()
        wire["token"] = input.token
        wire["platform"] = input.platform.wire
        input.userId?.let { wire["user_id"] = it }
        input.webPushP256dh?.let { wire["web_push_p256dh"] = it }
        input.webPushAuth?.let { wire["web_push_auth"] = it }
        input.metadata?.let { wire["metadata"] = it }
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
