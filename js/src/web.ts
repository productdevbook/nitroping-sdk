/**
 * `nitroping/web` — browser-only Web Push subscription helper.
 *
 * Wraps the full subscribe-and-register flow:
 *
 *   1. Register the service worker (`navigator.serviceWorker.register`).
 *   2. Ask the browser for notification permission.
 *   3. Fetch the app's VAPID public key from
 *      `GET /api/v1/public/apps/:id/vapid`.
 *   4. Call `pushManager.subscribe({ applicationServerKey })`.
 *   5. POST the resulting subscription to
 *      `POST /api/v1/public/devices` with `Authorization: Public pk_...`.
 *
 * Uses **public** API keys (`pk_...`) — safe to ship in browser code.
 *
 * @example
 * ```ts
 * import { subscribeWebPush } from "nitroping/web"
 *
 * const { device } = await subscribeWebPush({
 *   publicKey: "pk_live_...",
 *   appId: "0e1d2c3b-4a59-6877-9876-543210abcdef",
 *   userId: "user-42",
 * })
 * console.log("Registered device", device.id)
 * ```
 */

import {
  NetworkError,
  NitropingError,
  PermissionDeniedError,
  WebPushUnsupportedError,
} from "./errors"
import { DEFAULT_BASE_URL } from "./http"

/** Options for `subscribeWebPush`. */
export interface SubscribeWebPushOptions {
  /** Public API key (`pk_...`) for your app. */
  publicKey: string
  /** UUID of the app. Used to fetch the VAPID public key. */
  appId: string
  /**
   * Path that `navigator.serviceWorker.register` will load. Default:
   * `/sw.js`. The script itself must respond to `push` events — see
   * the README for a minimal implementation.
   */
  serviceWorkerPath?: string
  /** Optional registration scope. Defaults to whatever the SW path implies. */
  serviceWorkerScope?: string
  /**
   * Opaque tenant-side user id. Stored on the device row so you can
   * later target `{ user_ids: [...] }`.
   */
  userId?: string
  /**
   * Override the API base URL. Defaults to `https://nitroping.dev`.
   * Useful when running against a staging deployment.
   */
  baseUrl?: string
  /** Override the global `fetch` for testing. */
  fetch?: typeof fetch
  /** Override the global `navigator` for testing. */
  navigatorRef?: Navigator
}

/** Result of a successful `subscribeWebPush` call. */
export interface SubscribeWebPushResult {
  /** Registered device row. */
  device: { id: string; endpoint: string }
  /** Raw PushSubscription returned by the browser. */
  subscription: PushSubscription
}

/**
 * Subscribe the current browser to push and register the resulting
 * endpoint with nitroping. Idempotent — call it on every page load;
 * the server dedupes on `(app_id, token)`.
 */
export async function subscribeWebPush(
  options: SubscribeWebPushOptions,
): Promise<SubscribeWebPushResult> {
  const nav = options.navigatorRef ?? (typeof navigator !== "undefined" ? navigator : undefined)
  const win = typeof window !== "undefined" ? window : undefined
  const fetchImpl = options.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined)
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
  const swPath = options.serviceWorkerPath ?? "/sw.js"

  if (!nav || !("serviceWorker" in nav) || typeof win === "undefined" || !("PushManager" in win)) {
    throw new WebPushUnsupportedError()
  }
  if (typeof fetchImpl !== "function") {
    throw new WebPushUnsupportedError("Global `fetch` is not available")
  }

  // 1. Service worker.
  const registration = await nav.serviceWorker.register(
    swPath,
    options.serviceWorkerScope === undefined ? undefined : { scope: options.serviceWorkerScope },
  )
  await waitForActive(registration)

  // 2. Permission.
  const permission = await requestPermission(win)
  if (permission !== "granted") {
    throw new PermissionDeniedError(`Notification permission is ${permission}`)
  }

  // 3. VAPID public key.
  const vapidUrl = `${baseUrl}/api/v1/public/apps/${encodeURIComponent(options.appId)}/vapid`
  let vapidResponse: Response
  try {
    vapidResponse = await fetchImpl(vapidUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    })
  } catch (cause) {
    throw new NetworkError(
      `Failed to fetch VAPID public key: ${(cause as Error)?.message ?? cause}`,
      cause,
    )
  }
  if (!vapidResponse.ok) {
    const text = await vapidResponse.text().catch(() => "")
    throw new NitropingError(
      `Failed to fetch VAPID public key (HTTP ${vapidResponse.status}): ${text || vapidResponse.statusText}`,
      { status: vapidResponse.status, code: "vapid_fetch_failed" },
    )
  }
  const { public_key: vapidPublicKey } = (await vapidResponse.json()) as { public_key: string }
  if (!vapidPublicKey) {
    throw new NitropingError("VAPID response missing `public_key`", { code: "vapid_invalid" })
  }

  // 4. Subscribe.
  let subscription: PushSubscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast through `BufferSource`: lib.dom.d.ts narrows `applicationServerKey`
      // to `BufferSource | string | null`, but the Uint8Array generic bound
      // varies across TS versions. The browser accepts our Uint8Array fine.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
    })
  } catch (cause) {
    throw new NitropingError(
      `pushManager.subscribe failed: ${(cause as Error)?.message ?? cause}`,
      { code: "subscribe_failed", cause },
    )
  }

  // 5. Register with nitroping.
  const subJson = subscription.toJSON()
  const endpoint = subJson.endpoint ?? subscription.endpoint
  const keys = subJson.keys ?? {}

  const registerBody = {
    platform: "web",
    token: endpoint,
    web_push_p256dh: keys.p256dh,
    web_push_auth: keys.auth,
    user_id: options.userId,
  }

  let registerResponse: Response
  try {
    registerResponse = await fetchImpl(`${baseUrl}/api/v1/public/devices`, {
      method: "POST",
      headers: {
        Authorization: `Public ${options.publicKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(registerBody),
    })
  } catch (cause) {
    throw new NetworkError(
      `Failed to register device: ${(cause as Error)?.message ?? cause}`,
      cause,
    )
  }

  const registerText = await registerResponse.text()
  let registerJson: { id?: string; error?: { code?: string; message?: string } } = {}
  if (registerText) {
    try {
      registerJson = JSON.parse(registerText)
    } catch {
      // Non-JSON — fall through with empty body; surfaced below.
    }
  }

  if (!registerResponse.ok) {
    throw new NitropingError(
      registerJson.error?.message ?? `Device register failed (HTTP ${registerResponse.status})`,
      {
        status: registerResponse.status,
        code: registerJson.error?.code ?? `http_${registerResponse.status}`,
      },
    )
  }
  if (!registerJson.id) {
    throw new NitropingError("Device register response missing `id`", { code: "register_invalid" })
  }

  return {
    device: { id: registerJson.id, endpoint },
    subscription,
  }
}

async function waitForActive(registration: ServiceWorkerRegistration): Promise<void> {
  if (registration.active) return
  const installing = registration.installing ?? registration.waiting
  if (!installing) return
  await new Promise<void>((resolve) => {
    const listener = () => {
      if (installing.state === "activated") {
        installing.removeEventListener("statechange", listener)
        resolve()
      }
    }
    installing.addEventListener("statechange", listener)
  })
}

async function requestPermission(win: Window): Promise<NotificationPermission> {
  const N = (win as unknown as { Notification?: typeof Notification }).Notification
  if (!N) throw new WebPushUnsupportedError("Notification API is not available")
  if (N.permission === "granted") return "granted"
  if (N.permission === "denied") return "denied"
  return await N.requestPermission()
}

/**
 * Convert the VAPID public key from URL-safe base64 (the form the
 * server returns) into the `Uint8Array` `pushManager.subscribe`
 * expects.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i)
  }
  return out
}
