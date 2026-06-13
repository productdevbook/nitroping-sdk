/**
 * Shared request/response types for the nitroping HTTP API.
 *
 * The wire shape mirrors `POST /api/v1/notifications` on the
 * nitroping-pro server. Field names are snake_case on the wire; the
 * SDK accepts camelCase on input and converts at the boundary.
 */

/** Supported device platforms. */
export type Platform = "ios" | "android" | "web"

/** A single audience-segment condition over device fields + metadata. */
export interface SegmentCondition {
  /** `"platform"` | `"user_id"` | `"timezone"` | `"tag"` | `"metadata.<key>"`. */
  field: string
  /** Comparison operator. */
  op: "eq" | "neq" | "in" | "exists" | "contains" | "gt" | "lt"
  /** String, number, or array depending on `op` (omit for `exists`). */
  value?: string | number | Array<string | number>
}

/** Audience segment — match devices by a list of conditions. */
export interface Segment {
  /** AND (`"all"`, default) or OR (`"any"`) over the conditions. */
  match?: "all" | "any"
  conditions: SegmentCondition[]
}

/** Target selector for a notification. Exactly one of the variants. */
export type NotificationTarget =
  | { all: true }
  | { deviceIds: string[] }
  | { userIds: string[] }
  | { tags: string[] }
  | { segment: Segment }

/** Action button rendered on the notification (where the platform supports it). */
export interface NotificationAction {
  /** Stable id reported back in `notification.clicked` events. */
  id: string
  /** Button label shown to the user. */
  title: string
  /** Optional icon URL. */
  icon?: string
}

/**
 * Request body for `POST /api/v1/notifications`.
 *
 * Either `title + body` (raw payload) or `template + vars`
 * (Pro plan). Mixing the two is a 422.
 */
export interface SendNotificationRequest {
  /** Push notification title. */
  title?: string
  /** Push notification body / message. */
  body?: string
  /** Template slug — alternative to `title + body`. Requires Pro tier. */
  template?: string
  /** Variables interpolated into the template. */
  vars?: Record<string, unknown>
  /** Custom payload delivered alongside the visible push. */
  data?: Record<string, unknown>
  /** Notification icon URL. */
  icon?: string
  /** Notification image URL. */
  image?: string
  /** Legacy fallback URL when tapped. Prefer `deepLink`. */
  clickAction?: string
  /** URL or app deep link opened when the user taps the notification. */
  deepLink?: string
  /** Action buttons (where supported). */
  actions?: NotificationAction[]
  /** ISO-8601 timestamp; the row is held until then by the cron worker. */
  scheduledAt?: string
  /** ISO-8601 timestamp; after this the notification is dropped. */
  expiresAt?: string
  /**
   * 5-field cron expression. When set, this is a *recurring series*: the
   * server clones a one-shot occurrence on each tick. e.g. `"0 9 * * *"`.
   */
  recurrence?: string
  /** IANA timezone the `recurrence` cron is evaluated in (default `Etc/UTC`). */
  recurrenceTz?: string
  /** ISO-8601 timestamp; the series stops recurring after this. */
  recurrenceUntil?: string
  /**
   * Also deliver this notification as email to these addresses (in addition
   * to push). Title → subject, body → content.
   */
  emailTo?: string[]
  /** Where to send the notification. */
  target: NotificationTarget
}

/** Response from `POST /api/v1/notifications`. */
export interface NotificationResponse {
  /** UUID of the notification row. */
  id: string
  /** Initial status, usually `"queued"`. */
  status: string
}

/** Request body for `POST /api/v1/devices` (secret-key device register). */
export interface RegisterDeviceRequest {
  /** APNs token, FCM token, or Web Push endpoint URL. */
  token: string
  /** Device platform. */
  platform: Platform
  /** Opaque tenant-side user id. */
  userId?: string
  /** Required when `platform = "web"`. */
  webPushP256dh?: string
  /** Required when `platform = "web"`. */
  webPushAuth?: string
  /** Arbitrary key-value pairs stored alongside the device row. */
  metadata?: Record<string, unknown>
  /** Tags for tag-based targeting (`target: { tags: [...] }`). */
  tags?: string[]
  /**
   * APNs environment this iOS token belongs to. Apple's push host is
   * environment-specific and a token can't be inspected to tell which,
   * so the client must report it: `"sandbox"` for debug / development
   * builds (Xcode run, `react-native run-ios`), `"production"` for App
   * Store / TestFlight. Ignored for non-iOS platforms.
   */
  environment?: "sandbox" | "production"
  /**
   * IANA timezone for this device (e.g. `"Europe/Istanbul"`). Used for
   * quiet-hours delivery — sends inside the app's quiet window are deferred
   * to the window's end in the device's local time.
   */
  timezone?: string
}

/** Response from `POST /api/v1/devices`. */
export interface RegisterDeviceResponse {
  /** UUID of the device row. */
  id: string
  /** `true` if the device was created on this request; `false` if it already existed. */
  created: boolean
}

/** Request body for `PUT /api/v1/devices/:id` (update). */
export interface UpdateDeviceRequest {
  /** Replace the device's tags. */
  tags?: string[]
}

/** Response from `PUT /api/v1/devices/:id`. */
export interface UpdateDeviceResponse {
  /** UUID of the device row. */
  id: string
  /** The device's tags after the update. */
  tags: string[]
}

/** Delivery-tracking event type for `POST /api/v1/track`. */
export type TrackEvent = "delivered" | "opened" | "clicked"

/**
 * Request for `POST /api/v1/track`. Either identify the delivery by its
 * `deliveryLogId`, or by `notificationId` + the device's `deviceToken`.
 */
export type TrackRequest =
  | { deliveryLogId: string; event: TrackEvent }
  | { notificationId: string; deviceToken: string; event: TrackEvent }

/** Engagement event type for `POST /api/v1/events`. */
export type EngagementEvent = "opened" | "clicked"

/** Request body for `POST /api/v1/events` (public, unauthenticated engagement). */
export interface ReportEventRequest {
  /** UUID of the notification. */
  notificationId: string
  /** UUID of the device. */
  deviceId: string
  /** Event type. */
  type: EngagementEvent
  /** Optional action button id (for `clicked` on an action). */
  actionId?: string
  /** Optional ISO-8601 timestamp of when the event happened. */
  happenedAt?: string
}

/** One in-app notification-center entry, as returned by the inbox endpoints. */
export interface InboxItem {
  /** UUID of the inbox item. */
  id: string
  /** UUID of the originating notification. */
  notificationId: string
  title?: string
  body?: string
  data?: Record<string, unknown>
  deepLink?: string | null
  /** `true` once the item has been marked read. */
  read: boolean
  /** ISO-8601 timestamp when it was read, or null. */
  readAt?: string | null
  /** ISO-8601 timestamp when it landed in the inbox. */
  insertedAt?: string
}

/** Options for listing a user's inbox. */
export interface InboxListOptions {
  /** Only return unread items. */
  unreadOnly?: boolean
  /** Max items to return (server caps at 200). */
  limit?: number
}

/**
 * Outbound webhook event envelope (parsed from a `verifyWebhook` call).
 * Matches the structure built in `Nitroping.Webhooks.Outbound.dispatch/3`.
 */
export interface WebhookEvent {
  /** Event id, prefixed with `evt_`. */
  id: string
  /** Event type, e.g. `"notification.delivered"`, `"webhook.test"`. */
  type: string
  /** ISO-8601 timestamp set when the event was queued. */
  created_at: string
  /** Event-specific payload. */
  data: Record<string, unknown>
}
