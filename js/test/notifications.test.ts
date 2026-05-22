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

const procEnv = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
  ?.env

describe("Nitroping constructor", () => {
  afterEach(() => vi.restoreAllMocks())

  it("throws when no apiKey is provided and env is empty", () => {
    const original = procEnv?.NITROPING_API_KEY
    if (procEnv) delete procEnv.NITROPING_API_KEY
    try {
      expect(() => new Nitroping({})).toThrow(NitropingError)
    } finally {
      if (procEnv && original !== undefined) procEnv.NITROPING_API_KEY = original
    }
  })

  it("reads apiKey from NITROPING_API_KEY env var", () => {
    if (!procEnv) return // skip on runtimes with no process.env
    const original = procEnv.NITROPING_API_KEY
    procEnv.NITROPING_API_KEY = "np_env_test_key"
    try {
      const np = new Nitroping({})
      expect(np.http.apiKey).toBe("np_env_test_key")
    } finally {
      if (original === undefined) delete procEnv.NITROPING_API_KEY
      else procEnv.NITROPING_API_KEY = original
    }
  })
})

describe("notifications.send", () => {
  afterEach(() => vi.restoreAllMocks())

  it("posts to /api/v1/notifications with correct headers + JSON body", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "abc-123", status: "queued" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_test_secret" })
    const result = await np.notifications.send({
      title: "Order #4129 shipped",
      body: "On its way",
      deepLink: "https://example.com/orders/4129",
      actions: [{ id: "track", title: "Track" }],
      target: { all: true },
    })

    expect(result).toEqual({ id: "abc-123", status: "queued" })
    expect(spy).toHaveBeenCalledTimes(1)

    const call = spy.mock.calls[0]!
    const url = call[0] as string
    const init = call[1]!

    expect(url).toBe("https://nitroping.dev/api/v1/notifications")
    expect(init.method).toBe("POST")

    const headers = init.headers as Record<string, string>
    expect(headers["Authorization"]).toBe("ApiKey np_test_secret")
    expect(headers["Content-Type"]).toBe("application/json")
    expect(headers["Accept"]).toBe("application/json")

    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      title: "Order #4129 shipped",
      body: "On its way",
      deep_link: "https://example.com/orders/4129",
      actions: [{ id: "track", title: "Track" }],
      target: { all: true },
    })
  })

  it("forwards Idempotency-Key header when provided", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "n1", status: "queued" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    await np.notifications.send(
      { title: "Hi", body: "There", target: { userIds: ["u1"] } },
      { idempotencyKey: "order-shipped-4129" },
    )

    const init = spy.mock.calls[0]![1]!
    const headers = init.headers as Record<string, string>
    expect(headers["Idempotency-Key"]).toBe("order-shipped-4129")

    const body = JSON.parse(init.body as string)
    expect(body.target).toEqual({ user_ids: ["u1"] })
  })

  it("throws NitropingError on non-2xx with code/message/details from server envelope", async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: "validation_failed",
              message: "Request body failed validation",
              details: { title: ["can't be blank"] },
            },
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
    )

    const np = new Nitroping({ apiKey: "np_x" })

    const promise = np.notifications.send({
      // intentionally invalid
      body: "",
      target: { all: true },
    })

    await expect(promise).rejects.toBeInstanceOf(NitropingError)
    try {
      await promise
    } catch (err) {
      const e = err as NitropingError
      expect(e.status).toBe(422)
      expect(e.code).toBe("validation_failed")
      expect(e.message).toBe("Request body failed validation")
      expect(e.details).toEqual({ title: ["can't be blank"] })
    }
  })

  it("supports custom baseUrl", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "n1", status: "queued" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x", baseUrl: "https://staging.nitroping.dev/" })
    await np.notifications.send({ title: "x", body: "y", target: { all: true } })

    const url = spy.mock.calls[0]![0] as string
    expect(url).toBe("https://staging.nitroping.dev/api/v1/notifications")
  })

  it("converts target.deviceIds to wire format", async () => {
    const spy = mockFetch(
      () =>
        new Response(JSON.stringify({ id: "n1", status: "queued" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    await np.notifications.send({
      title: "x",
      body: "y",
      target: { deviceIds: ["d1", "d2"] },
    })

    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string)
    expect(body.target).toEqual({ device_ids: ["d1", "d2"] })
  })
})
