/*
 * NitropingPayload.kt
 *
 * Parses an inbound FCM `RemoteMessage.data` map and surfaces the fields
 * the SDK cares about: deep link, action buttons, tracking ids.
 *
 * Lives in `nitroping-android` (depends on the core + Android) so the
 * core module stays runnable on any JVM. This file uses only
 * `Map<String, String>` from FCM and our core types — no androidx import
 * is strictly required, which keeps `compileOnly`-style integration
 * straightforward.
 *
 * Usage from a FirebaseMessagingService:
 *
 *     class NitropingMessagingService : FirebaseMessagingService() {
 *         override fun onMessageReceived(remote: RemoteMessage) {
 *             val payload = NitropingPayload(remote.data)
 *             payload.deepLink?.let { url ->
 *                 startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
 *             }
 *         }
 *     }
 */

package dev.nitroping.android

import dev.nitroping.Action
import dev.nitroping.internal.Json

/**
 * Decoded view of a nitroping push payload.
 *
 * All properties are optional — if the payload didn't include a field, the
 * property is `null` (or an empty list, for [actions]) rather than throwing.
 * That keeps a malformed / partial `data` map from crashing the messaging
 * service.
 */
public data class NitropingPayload(
    /** Deep link URL to open. Parsed from `data.deep_link` or top-level `deep_link`. */
    public val deepLink: String?,
    /** Action buttons declared by the sender. Empty list when missing. */
    public val actions: List<Action>,
    /** Server-side notification id (`notif_...`). Pass to `client.events.report`. */
    public val notificationId: String?,
    /** Server-side device id (`dev_...`). Stable per `(app, token)` pair. */
    public val deviceId: String?,
    /** Platform the server thinks delivered this payload — `"android"` for FCM. */
    public val platform: String?,
    /**
     * Custom data the sender attached. Excludes nitroping-reserved keys
     * (`deep_link`, `actions_json`, `nitroping_*`, `notification_id`,
     * `device_id`, `platform`) which are surfaced as typed properties.
     */
    public val data: Map<String, String>,
) {
    /**
     * True if the payload looks like a nitroping payload at all. Useful as
     * a quick guard before forwarding events to your analytics.
     */
    public val isNitropingPayload: Boolean
        get() = notificationId != null || deepLink != null || actions.isNotEmpty()

    public companion object {
        // FCM data values are always strings (FCM serializes everything to
        // `Map<String, String>` even when the sender attached a JSON
        // object). nitroping-reserved keys live at the top level:
        //
        //   deep_link            → opens a URL on tap
        //   actions_json         → JSON-encoded array of {id, title, icon?}
        //   nitroping_notification_id, notification_id
        //   nitroping_device_id, device_id
        //   nitroping_platform, platform
        //
        // Everything else falls through to `data`.

        private val RESERVED_KEYS: Set<String> = setOf(
            "deep_link",
            "actions",
            "actions_json",
            "nitroping_notification_id",
            "notification_id",
            "nitroping_device_id",
            "device_id",
            "nitroping_platform",
            "platform",
        )
    }

    /**
     * Build a payload from a FCM `RemoteMessage.data` map (a
     * `Map<String, String>`). The argument is named loosely to avoid an
     * androidx dependency in this file — callers pass `remoteMessage.data`
     * directly.
     */
    public constructor(data: Map<String, String>) : this(
        deepLink = data["deep_link"]?.takeIf { it.isNotEmpty() },
        actions = parseActions(data["actions_json"] ?: data["actions"]),
        notificationId = firstNonEmpty(data, "nitroping_notification_id", "notification_id"),
        deviceId = firstNonEmpty(data, "nitroping_device_id", "device_id"),
        platform = firstNonEmpty(data, "nitroping_platform", "platform"),
        data = data.filterKeys { it !in RESERVED_KEYS },
    )
}

private fun firstNonEmpty(data: Map<String, String>, vararg keys: String): String? {
    for (key in keys) {
        val v = data[key]
        if (!v.isNullOrEmpty()) return v
    }
    return null
}

private fun parseActions(raw: String?): List<Action> {
    if (raw.isNullOrEmpty()) return emptyList()
    return try {
        val tree = Json.decode(raw)
        val list = tree as? List<*> ?: return emptyList()
        list.mapNotNull { item ->
            val map = item as? Map<*, *> ?: return@mapNotNull null
            val id = map["id"] as? String ?: return@mapNotNull null
            val title = map["title"] as? String ?: return@mapNotNull null
            Action(id = id, title = title, icon = map["icon"] as? String)
        }
    } catch (_: Throwable) {
        emptyList()
    }
}
