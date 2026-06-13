import { afterEach, describe, expect, it, vi } from "vitest"
import { Nitroping } from "../src/index"

function mockFetch(impl: (req: { url: string; init: RequestInit }) => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    return impl({ url, init: init ?? {} })
  })
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  })

describe("notifications.cancel", () => {
  afterEach(() => vi.restoreAllMocks())

  it("DELETEs /api/v1/notifications/:id", async () => {
    const spy = mockFetch(() => json({ id: "n-1", status: "canceled" }))
    const np = new Nitroping({ apiKey: "np_x" })

    const res = await np.notifications.cancel("n-1")
    expect(res).toEqual({ id: "n-1", status: "canceled" })

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(init.method).toBe("DELETE")
    expect(url).toBe("https://nitroping.dev/api/v1/notifications/n-1")
  })
})

describe("notifications tags target", () => {
  afterEach(() => vi.restoreAllMocks())

  it("converts { tags } to { tags } on the wire", async () => {
    const spy = mockFetch(() => json({ id: "n-2", status: "queued" }, 201))
    const np = new Nitroping({ apiKey: "np_x" })

    await np.notifications.send({
      title: "Hi",
      body: "There",
      target: { tags: ["beta", "vip"] },
    })

    const init = spy.mock.calls[0]![1]!
    const body = JSON.parse(init.body as string)
    expect(body.target).toEqual({ tags: ["beta", "vip"] })
  })
})

describe("devices.update", () => {
  afterEach(() => vi.restoreAllMocks())

  it("PUTs /api/v1/devices/:id with tags", async () => {
    const spy = mockFetch(() => json({ id: "dev-1", tags: ["a", "b"] }))
    const np = new Nitroping({ apiKey: "np_x" })

    const res = await np.devices.update("dev-1", { tags: ["a", "b"] })
    expect(res).toEqual({ id: "dev-1", tags: ["a", "b"] })

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(init.method).toBe("PUT")
    expect(url).toBe("https://nitroping.dev/api/v1/devices/dev-1")
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["a", "b"] })
  })
})

describe("devices.register with tags", () => {
  afterEach(() => vi.restoreAllMocks())

  it("forwards tags in the register body", async () => {
    const spy = mockFetch(() => json({ id: "dev-3", created: true }, 201))
    const np = new Nitroping({ apiKey: "np_x" })

    await np.devices.register({ platform: "ios", token: "t", tags: ["x"] })

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect(body.tags).toEqual(["x"])
  })
})

describe("track.record", () => {
  afterEach(() => vi.restoreAllMocks())

  it("posts a delivery_log_id event", async () => {
    const spy = mockFetch(() => json({ accepted: true }, 202))
    const np = new Nitroping({ apiKey: "np_x" })

    const res = await np.track.record({ deliveryLogId: "log-1", event: "delivered" })
    expect(res).toEqual({ accepted: true })

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("https://nitroping.dev/api/v1/track")
    expect(JSON.parse(init.body as string)).toEqual({
      delivery_log_id: "log-1",
      event: "delivered",
    })
  })

  it("posts a notification_id + device_token event", async () => {
    const spy = mockFetch(() => json({ accepted: true }, 202))
    const np = new Nitroping({ apiKey: "np_x" })

    await np.track.record({ notificationId: "n-1", deviceToken: "tok", event: "opened" })

    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toEqual({
      notification_id: "n-1",
      device_token: "tok",
      event: "opened",
    })
  })
})

describe("events.report", () => {
  afterEach(() => vi.restoreAllMocks())

  it("posts to /api/v1/events with snake_case body", async () => {
    const spy = mockFetch(() => json({ accepted: true }, 202))
    // The events endpoint is unauthenticated server-side; the SDK still
    // sends its Authorization header, which the server ignores.
    const np = new Nitroping({ apiKey: "np_x" })

    await np.events.report({
      notificationId: "n-1",
      deviceId: "d-1",
      type: "clicked",
      actionId: "reply",
    })

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("https://nitroping.dev/api/v1/events")
    expect(JSON.parse(init.body as string)).toEqual({
      notification_id: "n-1",
      device_id: "d-1",
      type: "clicked",
      action_id: "reply",
    })
  })
})
