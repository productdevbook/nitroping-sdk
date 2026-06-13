/*
 * Track.kt
 *
 * `np.track` — server-side delivery / open / click callback.
 *
 * Wraps `POST /api/v1/track`. Unlike `np.events` (the public, key-less
 * engagement endpoint) this is the secret-key callback the SDK uses to
 * report a delivery against a `delivery_log_id` (or `notification_id` +
 * the device's provider token). The server returns `202 Accepted` with
 * `{"accepted": true}` immediately — the write is absorbed by a background
 * worker, so a successful call only means "queued", not "persisted".
 *
 * Wire (one of two shapes):
 *
 *     { "delivery_log_id": "...", "event": "delivered" | "opened" | "clicked" }
 *     { "notification_id": "...", "device_token": "...",
 *       "event": "delivered" | "opened" | "clicked" }
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport

public class Track internal constructor(private val transport: HttpTransport) {
    /**
     * Record a delivery / open / click event.
     *
     * Identify the target either by [TrackRequest.ByDeliveryLog] (the
     * `deliveryLogId` the SDK received in the original push payload) or by
     * [TrackRequest.ByNotification] (`notificationId` + the device's
     * `deviceToken`).
     *
     * Returns [TrackResult] (`accepted = true`) on `202 Accepted`.
     */
    public suspend fun record(input: TrackRequest): TrackResult {
        val raw = transport.request(
            method = "POST",
            path = "/api/v1/track",
            body = toWire(input),
        )
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return TrackResult(accepted = map["accepted"] as? Boolean ?: false)
    }

    private fun toWire(input: TrackRequest): Map<String, Any?> = when (input) {
        is TrackRequest.ByDeliveryLog -> {
            require(input.deliveryLogId.isNotEmpty()) { "deliveryLogId must not be empty" }
            linkedMapOf(
                "delivery_log_id" to input.deliveryLogId,
                "event" to input.event.wire,
            )
        }
        is TrackRequest.ByNotification -> {
            require(input.notificationId.isNotEmpty()) { "notificationId must not be empty" }
            require(input.deviceToken.isNotEmpty()) { "deviceToken must not be empty" }
            linkedMapOf(
                "notification_id" to input.notificationId,
                "device_token" to input.deviceToken,
                "event" to input.event.wire,
            )
        }
    }
}
