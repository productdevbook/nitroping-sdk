/**
 * `devices` resource client.
 *
 * Mounted on `Nitroping` as `np.devices`. Wraps
 * `POST /api/v1/devices` and `DELETE /api/v1/devices/:id`.
 */

import type { HttpClient } from "./http"
import type { RegisterDeviceRequest, RegisterDeviceResponse } from "./types"

export class DevicesClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Register (or update) a device with the secret API key.
   *
   * Idempotent on `(app_id, token, user_id)`. Returns `created: true`
   * when a new row was inserted, `created: false` when an existing
   * device matched.
   */
  async register(input: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    return await this.http.request<RegisterDeviceResponse>("POST", "/api/v1/devices", {
      body: toWire(input),
    })
  }

  /**
   * Deactivate a device (soft delete — sets `status = inactive`).
   *
   * Returns `{ id, status: "inactive" }`. Throws a `NitropingError`
   * with `code: "not_found"` if the id doesn't belong to your app.
   */
  async deactivate(id: string): Promise<{ id: string; status: string }> {
    return await this.http.request("DELETE", `/api/v1/devices/${encodeURIComponent(id)}`)
  }
}

function toWire(input: RegisterDeviceRequest): Record<string, unknown> {
  const wire: Record<string, unknown> = {
    token: input.token,
    platform: input.platform,
  }
  if (input.userId !== undefined) wire["user_id"] = input.userId
  if (input.webPushP256dh !== undefined) wire["web_push_p256dh"] = input.webPushP256dh
  if (input.webPushAuth !== undefined) wire["web_push_auth"] = input.webPushAuth
  if (input.metadata !== undefined) wire["metadata"] = input.metadata
  return wire
}
