/**
 * Shared request/response types for the nitroping HTTP API.
 *
 * The wire shape mirrors `POST /api/v1/notifications` on the
 * nitroping-pro server. Field names are snake_case on the wire; the
 * SDK accepts camelCase on input and converts at the boundary.
 */

/** Supported device platforms. */
export type Platform = "ios" | "android" | "web"

/** Target selector for a notification. Exactly one of the three. */
export type NotificationTarget = { all: true } | { deviceIds: string[] } | { userIds: string[] }

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
}

/** Response from `POST /api/v1/devices`. */
export interface RegisterDeviceResponse {
  /** UUID of the device row. */
  id: string
  /** `true` if the device was created on this request; `false` if it already existed. */
  created: boolean
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
