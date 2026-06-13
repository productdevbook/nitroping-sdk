/**
 * `devices` resource client.
 *
 * Mounted on `Nitroping` as `np.devices`. Wraps `POST /api/v1/devices`,
 * `PUT /api/v1/devices/:id`, and `DELETE /api/v1/devices/:id`.
 */

import type { HttpClient } from "./http"
import type {
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateDeviceRequest,
  UpdateDeviceResponse,
} from "./types"

export class DevicesClient {
  constructor(private readonly http: HttpClient) {}

  /**
   * Register (or update) a device.
   *
   * Uses `/api/v1/public/devices` when the client was initialised with
   * a public key (`pk_`), `/api/v1/devices` for a secret key (`np_`).
   *
   * Idempotent on `(app_id, token, user_id)`. Returns `created: true`
   * when a new row was inserted, `created: false` when an existing
   * device matched.
   */
  async register(input: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    const path = this.http.authScheme === "Public" ? "/api/v1/public/devices" : "/api/v1/devices"
    return await this.http.request<RegisterDeviceResponse>("POST", path, {
      body: toWire(input),
    })
  }

  /**
   * Update a device (e.g. replace its tags). Wraps `PUT /api/v1/devices/:id`.
   *
   * Returns `{ id, tags }`. Throws a `NitropingError` with
   * `code: "not_found"` if the id doesn't belong to your app.
   */
  async update(id: string, input: UpdateDeviceRequest): Promise<UpdateDeviceResponse> {
    const body: Record<string, unknown> = {}
    if (input.tags !== undefined) body["tags"] = input.tags
    return await this.http.request<UpdateDeviceResponse>(
      "PUT",
      `/api/v1/devices/${encodeURIComponent(id)}`,
      { body },
    )
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
  if (input.tags !== undefined) wire["tags"] = input.tags
  if (input.environment !== undefined) wire["environment"] = input.environment
  return wire
}
