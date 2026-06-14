// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mountInboxBell, mountPushPrompt } from "../src/widgets"

/**
 * Widget tests run in happy-dom. Network is stubbed via a fake `fetch` that
 * routes by URL + method to canned JSON.
 */

const PK = "pk_test_000000000000"
const BASE = "https://example.test"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelector("#nitroping-widgets-style")?.remove()
  vi.restoreAllMocks()
})

describe("mountInboxBell", () => {
  function stubInbox(opts: { unread: number; items: unknown[] }) {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? "GET"

      if (url.includes("/inbox/unread_count")) {
        return jsonResponse({ unread_count: opts.unread })
      }
      if (url.includes("/inbox/read_all") && method === "POST") {
        return jsonResponse({ marked_read: opts.unread })
      }
      if (url.match(/\/inbox\/[^/]+\/read$/) && method === "POST") {
        return jsonResponse({ id: "i1", notification_id: "n1", read: true })
      }
      if (url.includes("/inbox")) {
        return jsonResponse({ items: opts.items })
      }
      return jsonResponse({}, 404)
    })
  }

  beforeEach(() => {
    document.body.appendChild(Object.assign(document.createElement("div"), { id: "bell" }))
  })

  it("renders a bell and shows the unread badge", async () => {
    vi.stubGlobal("fetch", stubInbox({ unread: 4, items: [] }))

    const handle = mountInboxBell({ target: "#bell", publicKey: PK, userId: "u1", baseUrl: BASE })
    // Let the initial refreshCount() microtasks resolve.
    await vi.waitFor(() => {
      const badge = document.querySelector(".np-badge") as HTMLElement
      expect(badge.hidden).toBe(false)
      expect(badge.textContent).toBe("4")
    })

    handle.unmount()
    expect(document.querySelector(".np-bell")).toBeNull()
  })

  it("opens the panel and lists items on click", async () => {
    const items = [
      {
        id: "i1",
        notification_id: "n1",
        title: "Hello",
        body: "World",
        read: false,
        inserted_at: new Date().toISOString(),
      },
    ]
    vi.stubGlobal("fetch", stubInbox({ unread: 1, items }))

    mountInboxBell({
      target: "#bell",
      publicKey: PK,
      userId: "u1",
      baseUrl: BASE,
      pollIntervalMs: 0,
    })

    const bell = document.querySelector(".np-bell") as HTMLButtonElement
    bell.click()

    await vi.waitFor(() => {
      expect(document.querySelector(".np-item-title")?.textContent).toBe("Hello")
      expect(document.querySelector(".np-item-body")?.textContent).toBe("World")
    })

    const panel = document.querySelector(".np-panel") as HTMLElement
    expect(panel.hidden).toBe(false)
  })

  it("marks an item read on click and decrements the badge", async () => {
    const items = [
      {
        id: "i1",
        notification_id: "n1",
        title: "A",
        read: false,
        inserted_at: new Date().toISOString(),
      },
    ]
    const fetchMock = stubInbox({ unread: 1, items })
    vi.stubGlobal("fetch", fetchMock)

    mountInboxBell({
      target: "#bell",
      publicKey: PK,
      userId: "u1",
      baseUrl: BASE,
      pollIntervalMs: 0,
    })

    const bell = document.querySelector(".np-bell") as HTMLButtonElement
    bell.click()
    await vi.waitFor(() => expect(document.querySelector(".np-item")).not.toBeNull())

    const item = document.querySelector(".np-item") as HTMLElement
    item.click()

    await vi.waitFor(() => {
      expect(item.classList.contains("np-unread")).toBe(false)
      // A POST to /read was issued.
      const calledRead = fetchMock.mock.calls.some(
        ([u, init]) => String(u).endsWith("/inbox/i1/read") && init?.method === "POST",
      )
      expect(calledRead).toBe(true)
    })
  })
})

describe("mountPushPrompt", () => {
  beforeEach(() => {
    document.body.appendChild(Object.assign(document.createElement("div"), { id: "prompt" }))
  })

  function stubPushSupport(permission: NotificationPermission) {
    vi.stubGlobal("Notification", { permission, requestPermission: vi.fn() })
    // The support gate checks `"serviceWorker" in navigator` and
    // `"PushManager" in window` — provide both in the test environment.
    if (!("serviceWorker" in navigator)) {
      Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true })
    }
    vi.stubGlobal("PushManager", function PushManager() {})
  }

  it("renders the prompt when push is supported and permission is default", () => {
    stubPushSupport("default")

    mountPushPrompt({ target: "#prompt", publicKey: PK, appId: "app-1", title: "Custom title" })

    const root = document.querySelector(".np-w") as HTMLElement
    expect(root.hidden).toBe(false)
    expect(document.querySelector(".np-prompt-title")?.textContent).toBe("Custom title")
    expect(document.querySelector(".np-btn")).not.toBeNull()
  })

  it("hides itself when permission is already denied", () => {
    stubPushSupport("denied")

    mountPushPrompt({ target: "#prompt", publicKey: PK, appId: "app-1" })

    expect((document.querySelector(".np-w") as HTMLElement).hidden).toBe(true)
  })

  it("unmount removes the widget", () => {
    stubPushSupport("default")
    const handle = mountPushPrompt({ target: "#prompt", publicKey: PK, appId: "app-1" })
    handle.unmount()
    expect(document.querySelector(".np-prompt")).toBeNull()
  })
})
