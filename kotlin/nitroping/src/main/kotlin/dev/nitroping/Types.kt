/*
 * Types.kt
 *
 * Public request / response models for the Nitroping HTTP API.
 *
 * Field names on the wire are snake_case; the SDK accepts camelCase on
 * input and converts at the boundary (in `Notifications.kt`, `Devices.kt`,
 * etc.). Keep these classes immutable data classes so they're cheap to
 * construct from any thread and trivial to use as map keys / in tests.
 */

package dev.nitroping

/** Supported device platforms (matches the `platform` enum on the server). */
public enum class Platform(public val wire: String) {
    IOS("ios"),
    ANDROID("android"),
    WEB("web");

    public companion object {
        /** Parse a wire-format string (`"ios"`, `"android"`, `"web"`) into the enum. */
        public fun fromWire(value: String): Platform? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * Where a notification should land. Exactly one of the three branches is
 * sent on the wire as the `target` object.
 *
 * Sealed so `when (target)` is exhaustive at the call site — the compiler
 * forces every branch to be handled and forwards a new platform target
 * loudly when the server grows one.
 */
public sealed class Target {
    /** Broadcast to every active device of the app. Wire: `{"all":true}`. */
    public data object All : Target()

    /** Send to a specific list of device ids (`dev_...`). Wire: `{"device_ids":[...]}`. */
    public data class DeviceIds(public val ids: List<String>) : Target()

    /** Send to every device bound to the given user ids. Wire: `{"user_ids":[...]}`. */
    public data class UserIds(public val ids: List<String>) : Target()

    /**
     * Send to every active device carrying any of the given tags. Wire:
     * `{"tags":[...]}`. Tags are attached on device register / update
     * (see [DeviceRequest.tags] and `devices.update`).
     */
    public data class Tags(public val tags: List<String>) : Target()

    /**
     * Send to every device matching an audience [segment]. Wire:
     * `{"segment":{"match":"all"|"any","conditions":[{...}]}}`. [match]
     * defaults to `"all"` (AND); pass `"any"` for OR over the conditions.
     */
    public data class Segment(
        public val match: String = "all",
        public val conditions: List<SegmentCondition>,
    ) : Target()
}

/**
 * One condition in an audience [Target.Segment].
 *
 * @property field device field to match — `"platform"`, `"user_id"`,
 *                 `"timezone"`, `"tag"`, or `"metadata.<key>"`.
 * @property op comparison operator — `"eq"`, `"neq"`, `"in"`, `"exists"`,
 *             `"contains"`, `"gt"`, `"lt"`.
 * @property value string, number, or list depending on [op]; omit (null)
 *                 for `"exists"`.
 */
public data class SegmentCondition(
    public val field: String,
    public val op: String,
    public val value: Any? = null,
)

/**
 * One action button on a notification. Stable id (`id`) round-trips into
 * the `notification.clicked` event so callers know which button fired.
 */
public data class Action(
    /** Stable identifier — matches `action_id` in `notification.clicked` events. */
    public val id: String,
    /** Localized button label. */
    public val title: String,
    /** Optional icon URL. */
    public val icon: String? = null,
)

/**
 * Request body for `POST /api/v1/notifications`.
 *
 * Either `title + body` (raw payload) or `template + vars` (Pro plan).
 * Mixing both is rejected with a 422 by the server.
 *
 * The `idempotencyKey` field maps to the `Idempotency-Key` HTTP header
 * (not a body field) — same key + same body replays the original response;
 * same key + different body returns a 409 with code `idempotency_conflict`.
 */
public data class SendRequest(
    public val title: String? = null,
    public val body: String? = null,
    public val template: String? = null,
    public val vars: Map<String, Any?>? = null,
    /** Custom payload delivered alongside the visible push (e.g. `{"order_id":"..."}`). */
    public val data: Map<String, Any?>? = null,
    public val icon: String? = null,
    public val image: String? = null,
    /** Legacy fallback URL when tapped. Prefer `deepLink`. */
    public val clickAction: String? = null,
    /** URL or app deep link opened when the user taps the notification. */
    public val deepLink: String? = null,
    public val actions: List<Action>? = null,
    /**
     * iOS only. Sets `aps.category` verbatim so an app that registered a
     * matching `UNNotificationCategory` renders the action buttons.
     * Overrides the server-minted category for this message.
     */
    public val apnsCategory: String? = null,
    /** ISO-8601 timestamp. The row is held until then by the cron worker. */
    public val scheduledAt: String? = null,
    /** ISO-8601 timestamp. After this the notification is dropped. */
    public val expiresAt: String? = null,
    /** Recurrence rule (e.g. an RRULE string). Repeats the send on a schedule. */
    public val recurrence: String? = null,
    /** IANA timezone the [recurrence] schedule is evaluated in (e.g. `"Europe/Istanbul"`). */
    public val recurrenceTz: String? = null,
    /** ISO-8601 timestamp; recurrence stops after this instant. */
    public val recurrenceUntil: String? = null,
    /** Email recipients for the email channel fan-out, when enabled. */
    public val emailTo: List<String>? = null,
    /** Where to send the notification — exactly one of the [Target] branches. */
    public val target: Target,
    /** Optional `Idempotency-Key` header value. Max 255 chars. */
    public val idempotencyKey: String? = null,
)

/** Response from `POST /api/v1/notifications`. */
public data class NotificationResult(
    /** UUID of the notification row. */
    public val id: String,
    /** Initial status — usually `"queued"`; `"scheduled"` if [SendRequest.scheduledAt] is in the future. */
    public val status: String,
)

/** Request body for `POST /api/v1/devices`. */
public data class DeviceRequest(
    /** APNs token, FCM token, or Web Push endpoint URL. */
    public val token: String,
    /** Device platform — picks which provider routes the message. */
    public val platform: Platform,
    /** Opaque tenant-side user id; same user across re-installs keeps notifications routed correctly. */
    public val userId: String? = null,
    /** Required when `platform = WEB`. Base64-url encoded p256dh key. */
    public val webPushP256dh: String? = null,
    /** Required when `platform = WEB`. Base64-url encoded auth secret. */
    public val webPushAuth: String? = null,
    /** Arbitrary key-value pairs stored alongside the device row. */
    public val metadata: Map<String, Any?>? = null,
    /**
     * Segmentation labels used by `target = Target.Tags(...)` on the
     * notifications endpoint. Trimmed + deduped server-side (max 32 tags,
     * 64 bytes each). Wire: `{"tags":[...]}`.
     */
    public val tags: List<String>? = null,
    /**
     * iOS APNs environment: `"sandbox"` or `"production"`. The push host is
     * environment-specific and a token can't reveal which, so report it for
     * iOS devices; ignored for other platforms. Wire: `{"environment":...}`.
     */
    public val environment: String? = null,
    /**
     * IANA timezone of the device (e.g. `"Europe/Istanbul"`). Used by
     * audience segments and recurrence scheduling. Wire: `{"timezone":...}`.
     */
    public val timezone: String? = null,
)

/** Response from `POST /api/v1/devices`. */
public data class DeviceResult(
    /** UUID of the device row. Persist this; it's what shows up in `NitropingPayload.deviceId`. */
    public val id: String,
    /** `true` if the device row was created on this request; `false` on idempotent replay. */
    public val created: Boolean,
)

/**
 * One device in a `GET /api/v1/devices` listing.
 *
 * The push token is **never** returned by the listing endpoint — only the
 * metadata below. To remove a device you know the token for but not the id,
 * use [Devices.deactivateByToken].
 */
public data class DeviceSummary(
    /** UUID of the device row. */
    public val id: String,
    /** Opaque tenant-side user id, or null when the device isn't bound to a user. */
    public val userId: String?,
    /** Device platform. */
    public val platform: Platform,
    /** `"active"` or `"inactive"` (soft-deleted). */
    public val status: String,
    /** Segmentation labels attached to the device. */
    public val tags: List<String>,
    /** IANA timezone of the device, or null when unreported. */
    public val timezone: String?,
    /** iOS APNs environment (`"sandbox"`/`"production"`), or null for non-iOS / unreported. */
    public val apnsEnvironment: String?,
    /** ISO-8601 timestamp the device was last seen, or null if never. */
    public val lastSeenAt: String?,
    /** ISO-8601 timestamp the device row was created. */
    public val insertedAt: String,
)

/** Response from `GET /api/v1/devices` (device listing). */
public data class ListDevicesResult(
    /** The page of devices. */
    public val data: List<DeviceSummary>,
    /** Total number of devices matching the filter (across all pages). */
    public val total: Int,
)

/** Response from `DELETE /api/v1/devices/:id`. */
public data class DeviceDeactivateResult(
    public val id: String,
    /** Soft-deleted; the row stays with `status = "inactive"`. */
    public val status: String,
)

/** Response from `PUT /api/v1/devices/:id` (device update). */
public data class DeviceUpdateResult(
    public val id: String,
    /** The device's tags after the update. Empty when all tags were cleared. */
    public val tags: List<String>,
)

/** Response from `DELETE /api/v1/notifications/:id` (cancel). */
public data class NotificationCancelResult(
    public val id: String,
    /** Status after cancellation — `"canceled"`. */
    public val status: String,
)

/** The kinds of event reported via `POST /api/v1/track`. */
public enum class TrackEvent(public val wire: String) {
    DELIVERED("delivered"),
    OPENED("opened"),
    CLICKED("clicked"),
}

/**
 * Request body for `POST /api/v1/track`. Exactly one of the two branches
 * identifies the target: either by the `deliveryLogId` the SDK received in
 * the original push payload, or by `notificationId` + the device's
 * `deviceToken`.
 */
public sealed class TrackRequest {
    /** The event being reported. */
    public abstract val event: TrackEvent

    /** Identify by the delivery log id. Wire: `{"delivery_log_id":..,"event":..}`. */
    public data class ByDeliveryLog(
        public val deliveryLogId: String,
        public override val event: TrackEvent,
    ) : TrackRequest()

    /**
     * Identify by notification id + the device's provider token. Wire:
     * `{"notification_id":..,"device_token":..,"event":..}`.
     */
    public data class ByNotification(
        public val notificationId: String,
        public val deviceToken: String,
        public override val event: TrackEvent,
    ) : TrackRequest()
}

/** Response from `POST /api/v1/track`. */
public data class TrackResult(
    /** Always `true` — track is best-effort and the server 202s immediately. */
    public val accepted: Boolean,
)

/**
 * One item in a user's in-app inbox (notification center). Returned by
 * the [InboxClient] endpoints under `/api/v1/public/inbox`.
 */
public data class InboxItem(
    /** UUID of the inbox row. */
    public val id: String,
    /** Server-side notification id this item was fanned out from. */
    public val notificationId: String,
    /** Visible title, when the notification carried one. */
    public val title: String? = null,
    /** Visible body, when the notification carried one. */
    public val body: String? = null,
    /** Custom payload delivered alongside the item. */
    public val data: Map<String, Any?>? = null,
    /** URL or app deep link opened when the item is tapped. */
    public val deepLink: String? = null,
    /** `true` once the item has been marked read. */
    public val read: Boolean,
    /** ISO-8601 timestamp the item was marked read; null while unread. */
    public val readAt: String? = null,
    /** ISO-8601 timestamp the item was created. */
    public val insertedAt: String? = null,
)

/** Response from `GET /api/v1/public/apps/:id/vapid`. */
public data class VapidPublicKey(
    /** Base64url-encoded VAPID public key for `pushManager.subscribe`. */
    public val publicKey: String,
)

/**
 * Decoded webhook event envelope (returned by `verifyWebhook`).
 *
 * Matches the structure built by `Nitroping.Webhooks.Outbound.dispatch/3`
 * on the server. `data` is the per-event payload; for
 * `notification.delivered` it carries `notification_id`, `device_id`,
 * `platform`, `user_id`; for `notification.clicked` it adds `action_id`;
 * for `webhook.test` it's an empty object.
 */
public data class WebhookEvent(
    /** Event id, prefixed with `evt_`. Unique per delivery. */
    public val id: String,
    /** Event type, e.g. `"notification.delivered"`, `"webhook.test"`. */
    public val type: String,
    /** ISO-8601 timestamp set when the event was queued. */
    public val createdAt: String,
    /** Event-specific payload. */
    public val data: Map<String, Any?>,
)
