/*
 * Events.kt
 *
 * `np.events` — engagement reporting.
 *
 * Posted from the client app when the user opens or taps an action on a
 * notification, so the dashboard can show open / click counters next to
 * delivered counters.
 *
 * Wire: `POST /api/v1/events` with body
 *     { "notification_id": "...", "type": "opened" | "clicked",
 *       "device_id": "...", "action_id": "..." }
 *
 * The server returns a 202 with `{"id":"evt_...","accepted":true}`.
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport

/** The two kinds of engagement we report back to nitroping. */
public enum class EngagementType(public val wire: String) {
    /** The user tapped the notification body (or the default action). */
    OPENED("opened"),

    /** The user tapped one of the action buttons; pair with `actionId`. */
    CLICKED("clicked"),
}

public class Events internal constructor(private val transport: HttpTransport) {
    /**
     * Report an engagement event.
     *
     * @param notificationId server-side notification id (`notif_...`).
     * @param type [EngagementType.OPENED] or [EngagementType.CLICKED].
     * @param deviceId server-side device id (`dev_...`). Optional but
     *                 recommended; lets the dashboard slice by device.
     * @param actionId action button id when [type] is [EngagementType.CLICKED].
     */
    public suspend fun report(
        notificationId: String,
        type: EngagementType,
        deviceId: String? = null,
        actionId: String? = null,
    ) {
        require(notificationId.isNotEmpty()) { "notificationId must not be empty" }
        val body = LinkedHashMap<String, Any?>()
        body["notification_id"] = notificationId
        body["type"] = type.wire
        if (deviceId != null) body["device_id"] = deviceId
        if (actionId != null) body["action_id"] = actionId
        transport.request(method = "POST", path = "/api/v1/events", body = body)
    }
}
