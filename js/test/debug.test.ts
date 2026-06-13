import { afterEach, describe, expect, it, vi } from "vitest"
import { type DebugEvent, Nitroping } from "../src/index"

function mockFetch(impl: () => Response) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => impl())
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } })

describe("debug logging", () => {
  afterEach(() => vi.restoreAllMocks())

  it("emits request + response events to a custom logger, with the auth header redacted", async () => {
    mockFetch(() => json({ id: "n1", status: "queued" }, 201))
    const events: DebugEvent[] = []

    const np = new Nitroping({ apiKey: "np_secret", debug: (e) => events.push(e) })
    await np.notifications.send({ title: "x", body: "y", target: { all: true } })

    const req = events.find((e) => e.phase === "request")!
    const res = events.find((e) => e.phase === "response")!

    expect(req.method).toBe("POST")
    expect(req.url).toContain("/api/v1/notifications")
    // Secret must never reach the sink.
    expect(req.headers.Authorization).toBe("[redacted]")
    expect(JSON.stringify(events)).not.toContain("np_secret")

    expect(res.phase === "response" && res.status).toBe(201)
    expect(res.phase === "response" && typeof res.ms).toBe("number")
  })

  it("emits a response event (with server code) on an error envelope", async () => {
    mockFetch(() => json({ error: { code: "validation_failed", message: "bad" } }, 422))
    const events: DebugEvent[] = []

    const np = new Nitroping({ apiKey: "np_x", debug: (e) => events.push(e) })
    await expect(
      np.notifications.send({ title: "x", body: "y", target: { all: true } }),
    ).rejects.toThrow()

    const res = events.find((e) => e.phase === "response")
    expect(res).toBeTruthy()
    expect(res!.phase === "response" && res!.status).toBe(422)
  })

  it("stays silent when debug is unset", async () => {
    mockFetch(() => json({ id: "n1", status: "queued" }, 201))
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})

    const np = new Nitroping({ apiKey: "np_x" })
    await np.notifications.send({ title: "x", body: "y", target: { all: true } })

    expect(spy).not.toHaveBeenCalled()
  })

  it("debug: true logs to console.debug", async () => {
    mockFetch(() => json({ id: "n1", status: "queued" }, 201))
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {})

    const np = new Nitroping({ apiKey: "np_x", debug: true })
    await np.notifications.send({ title: "x", body: "y", target: { all: true } })

    expect(spy).toHaveBeenCalled()
  })
})
