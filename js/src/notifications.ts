/**
 * `notifications` resource client.
 *
 * Mounted on `Nitroping` as `np.notifications`. Wraps
 * `POST /api/v1/notifications` and `GET /api/v1/notifications/:id`.
 */

import type { HttpClient } from "./http"
import type { NotificationResponse, SendNotificationRequest } from "./types"

/** Per-call overrides for `send()`. */
export interface SendOptions {
  /**
   * Optional `Idempotency-Key`. If the same key + the same body is sent
   * again the server replays the cached response. Same key + different
   * body returns a 409 (`idempotency_conflict`).
   *
   * Max 255 characters. Pick something stable + unique for the logical
   * operation (e.g. `order-shipped-4129`).
   */
  idempotencyKey?: string
}

export class NotificationsClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Enqueue a new notification.
   *
   * Returns `{ id, status }` on `201 Created`. On non-2xx the SDK
   * throws a `NitropingError` carrying the server's `code`, `message`,
   * and (for validation failures) the per-field `details` map.
   */
  async send(
    input: SendNotificationRequest,
    options: SendOptions = {},
  ): Promise<NotificationResponse> {
    const headers: Record<string, string> = {}
    if (options.idempotencyKey !== undefined) {
      headers["Idempotency-Key"] = options.idempotencyKey
    }

    return await this.http.request<NotificationResponse>("POST", "/api/v1/notifications", {
      body: toWire(input),
      headers,
    })
  }

  /** Fetch a previously enqueued notification by id. */
  async get(id: string): Promise<Record<string, unknown>> {
    return await this.http.request("GET", `/api/v1/notifications/${encodeURIComponent(id)}`)
  }

  /**
   * Cancel a scheduled or in-flight notification. Wraps
   * `DELETE /api/v1/notifications/:id`.
   *
   * Returns `{ id, status: "canceled" }`. Throws a `NitropingError`
   * with `code: "cannot_cancel"` (409) if the notification already
   * reached a terminal state, or `code: "not_found"` (404).
   */
  async cancel(id: string): Promise<{ id: string; status: string }> {
    return await this.http.request("DELETE", `/api/v1/notifications/${encodeURIComponent(id)}`)
  }
}

/**
 * Convert the camelCase SDK shape into the snake_case wire shape the
 * Phoenix controller expects.
 */
function toWire(input: SendNotificationRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = {}
  if (input.title !== undefined) wire["title"] = input.title
  if (input.body !== undefined) wire["body"] = input.body
  if (input.template !== undefined) wire["template"] = input.template
  if (input.vars !== undefined) wire["vars"] = input.vars
  if (input.data !== undefined) wire["data"] = input.data
  if (input.icon !== undefined) wire["icon"] = input.icon
  if (input.image !== undefined) wire["image"] = input.image
  if (input.clickAction !== undefined) wire["click_action"] = input.clickAction
  if (input.deepLink !== undefined) wire["deep_link"] = input.deepLink
  if (input.actions !== undefined) wire["actions"] = input.actions
  if (input.scheduledAt !== undefined) wire["scheduled_at"] = input.scheduledAt
  if (input.expiresAt !== undefined) wire["expires_at"] = input.expiresAt
  wire["target"] = targetToWire(input.target)
  return wire
}

function targetToWire(target: SendNotificationRequest["target"]): Record<string, unknown> {
  if ("all" in target) return { all: target.all }
  if ("deviceIds" in target) return { device_ids: target.deviceIds }
  if ("userIds" in target) return { user_ids: target.userIds }
  if ("tags" in target) return { tags: target.tags }
  // `target` is a discriminated union — exhaustiveness is enforced at
  // the type level, but fall back to passing through for forward compat.
  return target as Record<string, unknown>
}
