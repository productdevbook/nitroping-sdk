/**
 * `track` resource client.
 *
 * Mounted on `Nitroping` as `np.track`. Wraps `POST /api/v1/track` — the
 * server SDK delivery/open/click callback. Returns 202 immediately; the
 * write is absorbed by a background worker.
 */

import type { HttpClient } from "./http"
import type { TrackRequest } from "./types"

export class TrackClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Record a delivery/open/click event against a delivery log.
   *
   * Identify the target either by `deliveryLogId`, or by
   * `notificationId` + the device's `deviceToken`. `event` is one of
   * `delivered | opened | clicked`.
   *
   * Resolves to `{ accepted: true }` on 202.
   */
  async record(input: TrackRequest): Promise<{ accepted: boolean }> {
    return await this.http.request<{ accepted: boolean }>("POST", "/api/v1/track", {
      body: toWire(input),
    })
  }
}

function toWire(input: TrackRequest): Record<string, unknown> {
  if ("deliveryLogId" in input) {
    return { delivery_log_id: input.deliveryLogId, event: input.event }
  }
  return {
    notification_id: input.notificationId,
    device_token: input.deviceToken,
    event: input.event,
  }
}
