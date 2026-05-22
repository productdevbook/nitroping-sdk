import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionDeniedError, WebPushUnsupportedError } from "../src/index"
import { subscribeWebPush } from "../src/web"

/**
 * Hand-rolled browser stubs. We avoid happy-dom to keep `devDependencies`
 * small — every call site we exercise (`navigator.serviceWorker`,
 * `Notification.permission`, `pushManager.subscribe`) is small enough
 * to stub directly.
 */

interface FakeSubscription {
  endpoint: string
  toJSON(): { endpoint: string; keys?: { p256dh: string; auth: string } }
}

function makeFakeWindow(
  opts: { permission: NotificationPermission; requestPermission?: NotificationPermission } = {
    permission: "granted",
  },
) {
  const Notification = {
    permission: opts.permission,
    requestPermission: vi.fn(async () => opts.requestPermission ?? "granted"),
  }
  const win = {
    Notification,
    PushManager: function PushManager() {},
  } as unknown as Window

  return win
}

function makeFakeNav(
  opts: {
    subscription?: FakeSubscription
    subscribeError?: Error
  } = {},
) {
  const subscription =
    opts.subscription ??
    ({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: "test-p256dh", auth: "test-auth" },
        }
      },
    } satisfies FakeSubscription)

  const pushManager = {
    subscribe: vi.fn(async () => {
      if (opts.subscribeError) throw opts.subscribeError
      return subscription
    }),
  }

  const registration = {
    pushManager,
    active: { state: "activated" },
    installing: null,
    waiting: null,
  } as unknown as ServiceWorkerRegistration

  const register = vi.fn(async () => registration)

  const nav = {
    serviceWorker: { register },
  } as unknown as Navigator

  return { nav, register, pushManager, subscription }
}

describe("subscribeWebPush", () => {
  // Provide global `window` + `atob` for the helper code.
  let originalWindow: unknown
  let originalAtob: unknown

  beforeEach(() => {
    originalWindow = (globalThis as { window?: unknown }).window
    originalAtob = (globalThis as { atob?: unknown }).atob
    ;(globalThis as { window?: unknown }).window = makeFakeWindow({ permission: "granted" })
    ;(globalThis as { atob: (s: string) => string }).atob = (s: string) => {
      const buf = (
        globalThis as unknown as {
          Buffer: { from: (data: string, enc: string) => { toString(enc: string): string } }
        }
      ).Buffer
      return buf.from(s, "base64").toString("binary")
    }
  })

  afterEach(() => {
    ;(globalThis as { window?: unknown }).window = originalWindow
    ;(globalThis as { atob?: unknown }).atob = originalAtob
    vi.restoreAllMocks()
  })

  it("registers the SW, fetches VAPID, subscribes, and posts to public devices", async () => {
    const { nav, register, pushManager } = makeFakeNav()

    const fetchSpy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u =
        typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url
      if (u.includes("/vapid")) {
        return new Response(
          JSON.stringify({
            public_key:
              "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        )
      }
      if (u.includes("/public/devices")) {
        const body = JSON.parse((init?.body as string) ?? "{}")
        expect(body.platform).toBe("web")
        expect(body.token).toBe("https://fcm.googleapis.com/fcm/send/abc")
        expect(body.web_push_p256dh).toBe("test-p256dh")
        expect(body.web_push_auth).toBe("test-auth")
        expect(body.user_id).toBe("user-42")

        const headers = (init?.headers ?? {}) as Record<string, string>
        expect(headers["Authorization"]).toBe("Public pk_live_test")
        expect(headers["Content-Type"]).toBe("application/json")

        return new Response(JSON.stringify({ id: "device-xyz", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw new Error(`Unexpected fetch: ${u}`)
    })

    const { device, subscription } = await subscribeWebPush({
      publicKey: "pk_live_test",
      appId: "app-id-uuid",
      userId: "user-42",
      navigatorRef: nav,
      fetch: fetchSpy as unknown as typeof fetch,
    })

    expect(device.id).toBe("device-xyz")
    expect(device.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc")
    expect(subscription.endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc")

    expect(register).toHaveBeenCalledWith("/sw.js", undefined)
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1)
    const subscribeArg = (pushManager.subscribe.mock.calls as unknown[][])[0]?.[0] as
      | { userVisibleOnly?: boolean; applicationServerKey?: unknown }
      | undefined
    expect(subscribeArg?.userVisibleOnly).toBe(true)
    expect(subscribeArg?.applicationServerKey).toBeInstanceOf(Uint8Array)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it("throws PermissionDeniedError when the user blocks notifications", async () => {
    ;(globalThis as { window: Window }).window = makeFakeWindow({
      permission: "default",
      requestPermission: "denied",
    })
    const { nav } = makeFakeNav()
    const fetchSpy = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch

    await expect(
      subscribeWebPush({
        publicKey: "pk_live_test",
        appId: "app-id",
        navigatorRef: nav,
        fetch: fetchSpy,
      }),
    ).rejects.toBeInstanceOf(PermissionDeniedError)
  })

  it("throws WebPushUnsupportedError when navigator lacks serviceWorker", async () => {
    const noSwNav = {} as Navigator
    const fetchSpy = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch

    await expect(
      subscribeWebPush({
        publicKey: "pk_x",
        appId: "app-id",
        navigatorRef: noSwNav,
        fetch: fetchSpy,
      }),
    ).rejects.toBeInstanceOf(WebPushUnsupportedError)
  })
})
