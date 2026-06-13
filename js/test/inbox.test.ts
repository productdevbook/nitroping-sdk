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
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } })

describe("inbox", () => {
  afterEach(() => vi.restoreAllMocks())

  it("list maps wire items to camelCase + sends user_id query", async () => {
    const spy = mockFetch(() =>
      json({
        items: [
          {
            id: "i1",
            notification_id: "n1",
            title: "Hi",
            body: "there",
            data: {},
            deep_link: "https://x/y",
            read: false,
            read_at: null,
            inserted_at: "2026-06-13T00:00:00Z",
          },
        ],
      }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    const items = await np.inbox.list("user-1", { unreadOnly: true, limit: 10 })

    const url = String(spy.mock.calls[0]![0])
    expect(url).toContain("/api/v1/public/inbox")
    expect(url).toContain("user_id=user-1")
    expect(url).toContain("unread_only=true")
    expect(url).toContain("limit=10")

    expect(items).toEqual([
      {
        id: "i1",
        notificationId: "n1",
        title: "Hi",
        body: "there",
        data: {},
        deepLink: "https://x/y",
        read: false,
        readAt: null,
        insertedAt: "2026-06-13T00:00:00Z",
      },
    ])
  })

  it("unreadCount returns the number", async () => {
    mockFetch(() => json({ unread_count: 7 }))
    const np = new Nitroping({ apiKey: "np_x" })
    expect(await np.inbox.unreadCount("u1")).toBe(7)
  })

  it("markRead posts user_id and returns the updated item", async () => {
    const spy = mockFetch(() =>
      json({ id: "i1", notification_id: "n1", read: true, read_at: "2026-06-13T01:00:00Z" }),
    )

    const np = new Nitroping({ apiKey: "np_x" })
    const item = await np.inbox.markRead("u1", "i1")

    const [url, init] = spy.mock.calls[0]! as [string, RequestInit]
    expect(url).toContain("/api/v1/public/inbox/i1/read")
    expect(JSON.parse(init.body as string)).toEqual({ user_id: "u1" })
    expect(item.read).toBe(true)
  })

  it("markAllRead returns the count", async () => {
    mockFetch(() => json({ marked_read: 3 }))
    const np = new Nitroping({ apiKey: "np_x" })
    expect(await np.inbox.markAllRead("u1")).toBe(3)
  })
})
