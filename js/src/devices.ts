/**
 * `devices` resource client.
 *
 * Mounted on `Nitroping` as `np.devices`. Wraps `GET /api/v1/devices`,
 * `POST /api/v1/devices`, `PUT /api/v1/devices/:id`, `DELETE
 * /api/v1/devices/:id`, and `DELETE /api/v1/devices` (by token).
 */

import type { HttpClient } from "./http"
import type {
  ListDevicesQuery,
  ListDevicesResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdateDeviceRequest,
  UpdateDeviceResponse,
} from "./types"

interface RawDeviceSummary {
  id: string
  user_id: string | null
  platform: RegisterDeviceRequest["platform"]
  status: "active" | "inactive"
  tags: string[]
  timezone: string | null
  apns_environment: "sandbox" | "production" | null
  last_seen_at: string | null
  inserted_at: string
}

interface RawListDevicesResponse {
  data: RawDeviceSummary[]
  total: number
}

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
   * List devices (secret key only). Wraps `GET /api/v1/devices`.
   *
   * Pass `userId` to fetch one end-user's registered devices. The push
   * token is never returned. Returns `{ data, total }`.
   */
  async list(query: ListDevicesQuery = {}): Promise<ListDevicesResponse> {
    const wire: Record<string, string | number | undefined> = {
      user_id: query.userId,
      platform: query.platform,
      status: query.status,
      page: query.page,
      page_size: query.pageSize,
    }

    const raw = await this.http.request<RawListDevicesResponse>("GET", "/api/v1/devices", {
      query: wire,
    })

    return {
      total: raw.total,
      data: raw.data.map((d) => ({
        id: d.id,
        userId: d.user_id,
        platform: d.platform,
        status: d.status,
        tags: d.tags,
        timezone: d.timezone,
        apnsEnvironment: d.apns_environment,
        lastSeenAt: d.last_seen_at,
        insertedAt: d.inserted_at,
      })),
    }
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

  /**
   * Deactivate a device by its provider token (logout flow — you know the
   * token but not the device id). Wraps `DELETE /api/v1/devices` with a
   * `{ token }` body.
   *
   * Returns `{ id, status: "inactive" }`. Throws a `NitropingError` with
   * `code: "not_found"` when no device with that token belongs to your app.
   */
  async deactivateByToken(token: string): Promise<{ id: string; status: string }> {
    return await this.http.request("DELETE", "/api/v1/devices", { body: { token } })
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
  if (input.timezone !== undefined) wire["timezone"] = input.timezone
  return wire
}
