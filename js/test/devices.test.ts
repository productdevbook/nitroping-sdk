import { afterEach, describe, expect, it, vi } from "vitest"
import { Nitroping, NitropingError } from "../src/index"

function mockFetch(
  impl: (req: { url: string; init: RequestInit }) => Response | Promise<Response>,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    return await impl({ url, init: init ?? {} })
  })
}

describe("devices.register", () => {
  afterEach(() => vi.restoreAllMocks())

  it("posts to /api/v1/devices with snake_case body", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-1", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    const result = await np.devices.register({
      platform: "ios",
      token: "apns-token-abc",
      userId: "user-42",
      metadata: { source: "tests" },
    })

    expect(result).toEqual({ id: "dev-1", created: true })

    const init = spy.mock.calls[0]![1]!
    expect(init.method).toBe("POST")
    expect(spy.mock.calls[0]![0] as string).toBe("https://nitroping.dev/api/v1/devices")
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("ApiKey np_x")

    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      platform: "ios",
      token: "apns-token-abc",
      user_id: "user-42",
      metadata: { source: "tests" },
    })
  })

  it("supports the web platform with p256dh/auth keys", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-2", created: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    const result = await np.devices.register({
      platform: "web",
      token: "https://fcm.googleapis.com/abc",
      webPushP256dh: "BPS_p256dh_value",
      webPushAuth: "auth_secret_value",
    })

    expect(result.created).toBe(false)
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect(body.web_push_p256dh).toBe("BPS_p256dh_value")
    expect(body.web_push_auth).toBe("auth_secret_value")
  })

  it("forwards the iOS environment field on the wire", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-3", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    await np.devices.register({
      platform: "ios",
      token: "ios-token",
      environment: "sandbox",
    })

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect(body.environment).toBe("sandbox")
  })

  it("forwards the timezone field on the wire", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-tz", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    await np.devices.register({
      platform: "ios",
      token: "ios-token",
      timezone: "Europe/Istanbul",
    })

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect(body.timezone).toBe("Europe/Istanbul")
  })

  it("omits environment when not provided", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-4", created: true }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    await np.devices.register({ platform: "ios", token: "ios-token" })

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect("environment" in body).toBe(false)
  })
})

describe("devices.deactivate", () => {
  afterEach(() => vi.restoreAllMocks())

  it("sends DELETE to /api/v1/devices/:id", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "dev-1", status: "inactive" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    const result = await np.devices.deactivate("dev-1")

    expect(result).toEqual({ id: "dev-1", status: "inactive" })
    expect(spy.mock.calls[0]![0] as string).toBe("https://nitroping.dev/api/v1/devices/dev-1")
    expect(spy.mock.calls[0]![1]!.method).toBe("DELETE")
  })

  it("throws NitropingError with not_found on 404", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: "not_found", message: "Device not found" } }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
    )

    const np = new Nitroping({ apiKey: "np_x" })

    try {
      await np.devices.deactivate("missing")
      expect.fail("expected error")
    } catch (err) {
      const e = err as NitropingError
      expect(e).toBeInstanceOf(NitropingError)
      expect(e.code).toBe("not_found")
      expect(e.status).toBe(404)
    }
  })
})
