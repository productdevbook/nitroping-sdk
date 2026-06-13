/**
 * `events` resource client.
 *
 * Mounted on `Nitroping` as `np.events`. Wraps `POST /api/v1/events` —
 * the public, unauthenticated engagement endpoint. The
 * `(notificationId, deviceId)` pair is the bearer secret, so no
 * `Authorization` header is required (and a `pk_` public key is fine).
 *
 * This is the endpoint a client app calls when a notification is opened
 * or a notification action is clicked.
 */

import type { HttpClient } from "./http"
import type { ReportEventRequest } from "./types"

export class EventsClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Report an engagement event (`opened` or `clicked`).
   *
   * Resolves to `{ accepted: true }` on 202. Throws a `NitropingError`
   * with `code: "not_found"` (404) if the notification/device pair is
   * unknown.
   */
  async report(input: ReportEventRequest): Promise<{ accepted: boolean }> {
    const body: Record<string, unknown> = {
      notification_id: input.notificationId,
      device_id: input.deviceId,
      type: input.type,
    }
    if (input.actionId !== undefined) body["action_id"] = input.actionId
    if (input.happenedAt !== undefined) body["happened_at"] = input.happenedAt

    return await this.http.request<{ accepted: boolean }>("POST", "/api/v1/events", { body })
  }
}
