/**
 * `nitroping/widgets` — ready-made, framework-agnostic browser UI.
 *
 * Two drop-in components that render with plain DOM (no framework, no build
 * step required) and talk to the **public** (`pk_`) API:
 *
 *   * {@link mountPushPrompt} — a web-push opt-in button/card. On click it runs
 *     the full {@link subscribeWebPush} flow (service worker → permission →
 *     VAPID → subscribe → register).
 *   * {@link mountInboxBell} — a notification bell with an unread badge and a
 *     dropdown list backed by the in-app inbox endpoints.
 *
 * Both inject a single scoped stylesheet once, accept light theming, and
 * return a handle with `unmount()` so host apps (vanilla, React, Vue, …) can
 * clean up. They never touch secret keys.
 *
 * @example
 * ```ts
 * import { mountPushPrompt, mountInboxBell } from "nitroping/widgets"
 *
 * mountPushPrompt({
 *   target: "#push-prompt",
 *   publicKey: "pk_live_...",
 *   appId: "0e1d2c3b-...",
 *   userId: "user-42",
 * })
 *
 * mountInboxBell({
 *   target: "#inbox-bell",
 *   publicKey: "pk_live_...",
 *   userId: "user-42",
 * })
 * ```
 */

import { HttpClient } from "./http"
import { InboxClient } from "./inbox"
import type { InboxItem } from "./types"
import { subscribeWebPush, type SubscribeWebPushResult } from "./web"

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** A DOM element or a CSS selector resolving to one. */
export type WidgetTarget = string | HTMLElement

/** Handle returned by every widget mount. */
export interface WidgetHandle {
  /** Remove the widget from the DOM and detach its timers/listeners. */
  unmount(): void
}

function resolveTarget(target: WidgetTarget): HTMLElement {
  if (typeof target === "string") {
    const el = document.querySelector(target)
    if (!el) throw new Error(`nitroping widget: target "${target}" not found`)
    return el as HTMLElement
  }
  return target
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// One stylesheet for all widgets, injected the first time any widget mounts.
const STYLE_ID = "nitroping-widgets-style"

function ensureStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return
  const style = el("style")
  style.id = STYLE_ID
  style.textContent = WIDGET_CSS
  document.head.appendChild(style)
}

// Scoped under `.np-` so it can't collide with host styles. Theming is driven
// by CSS custom properties set on the widget root (see applyTheme).
const WIDGET_CSS = `
.np-w{--np-accent:#4f46e5;--np-fg:#111827;--np-muted:#6b7280;--np-bg:#fff;--np-border:#e5e7eb;
  font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--np-fg);box-sizing:border-box}
.np-w *{box-sizing:border-box}
.np-btn{display:inline-flex;align-items:center;gap:.5rem;border:none;border-radius:.5rem;
  background:var(--np-accent);color:#fff;font-size:.875rem;font-weight:500;padding:.5rem .875rem;
  cursor:pointer;line-height:1.2;transition:opacity .15s}
.np-btn:hover{opacity:.9}
.np-btn:disabled{opacity:.55;cursor:default}
.np-prompt{display:flex;align-items:center;gap:.75rem;max-width:24rem;padding:.875rem 1rem;
  background:var(--np-bg);border:1px solid var(--np-border);border-radius:.75rem}
.np-prompt-body{flex:1;min-width:0}
.np-prompt-title{font-size:.9rem;font-weight:600;margin:0 0 .15rem}
.np-prompt-text{font-size:.8rem;color:var(--np-muted);margin:0}
.np-prompt-msg{font-size:.8rem;margin:.5rem 0 0}
.np-prompt-msg.np-err{color:#dc2626}
.np-prompt-msg.np-ok{color:#059669}
.np-bell-wrap{position:relative;display:inline-block}
.np-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;
  width:2.25rem;height:2.25rem;border:1px solid var(--np-border);border-radius:.625rem;
  background:var(--np-bg);cursor:pointer;color:var(--np-fg)}
.np-bell:hover{background:#f9fafb}
.np-badge{position:absolute;top:-.35rem;right:-.35rem;min-width:1.1rem;height:1.1rem;padding:0 .3rem;
  background:#dc2626;color:#fff;border-radius:999px;font-size:.7rem;font-weight:600;
  display:flex;align-items:center;justify-content:center;line-height:1}
.np-panel{position:absolute;right:0;top:calc(100% + .5rem);width:22rem;max-width:90vw;max-height:26rem;
  display:flex;flex-direction:column;background:var(--np-bg);border:1px solid var(--np-border);
  border-radius:.75rem;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden;z-index:9999}
.np-panel[hidden]{display:none}
.np-panel-head{display:flex;align-items:center;justify-content:space-between;padding:.625rem .875rem;
  border-bottom:1px solid var(--np-border)}
.np-panel-title{font-size:.85rem;font-weight:600}
.np-mark-all{border:none;background:none;color:var(--np-accent);font-size:.75rem;cursor:pointer;padding:0}
.np-mark-all:disabled{color:var(--np-muted);cursor:default}
.np-list{overflow-y:auto;flex:1;margin:0;padding:0;list-style:none}
.np-item{display:block;padding:.625rem .875rem;border-bottom:1px solid var(--np-border);
  cursor:pointer;text-decoration:none;color:inherit}
.np-item:hover{background:#f9fafb}
.np-item.np-unread{background:#eef2ff}
.np-item.np-unread:hover{background:#e0e7ff}
.np-item-title{font-size:.825rem;font-weight:600;margin:0 0 .15rem}
.np-item-body{font-size:.8rem;color:var(--np-muted);margin:0;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.np-item-time{font-size:.7rem;color:var(--np-muted);margin-top:.25rem}
.np-empty,.np-loading{padding:1.75rem 1rem;text-align:center;color:var(--np-muted);font-size:.825rem}
`

/** Optional theme overrides applied as CSS custom properties on the root. */
export interface WidgetTheme {
  /** Primary/accent color (buttons, links). */
  accent?: string
  /** Foreground text color. */
  foreground?: string
  /** Muted/secondary text color. */
  muted?: string
  /** Surface background color. */
  background?: string
  /** Border color. */
  border?: string
}

function applyTheme(root: HTMLElement, theme?: WidgetTheme): void {
  if (!theme) return
  if (theme.accent) root.style.setProperty("--np-accent", theme.accent)
  if (theme.foreground) root.style.setProperty("--np-fg", theme.foreground)
  if (theme.muted) root.style.setProperty("--np-muted", theme.muted)
  if (theme.background) root.style.setProperty("--np-bg", theme.background)
  if (theme.border) root.style.setProperty("--np-border", theme.border)
}

// ─── Web-push prompt ────────────────────────────────────────────────────────

/** Options for {@link mountPushPrompt}. */
export interface PushPromptOptions {
  /** Where to mount (selector or element). */
  target: WidgetTarget
  /** Public API key (`pk_...`). */
  publicKey: string
  /** App UUID — used to fetch the VAPID key. */
  appId: string
  /** Opaque end-user id stored on the device row. */
  userId?: string
  /** Service worker path passed to {@link subscribeWebPush}. Default `/sw.js`. */
  serviceWorkerPath?: string
  /** Override the API base URL (staging, self-host). */
  baseUrl?: string
  /** Headline text. Default "Stay in the loop". */
  title?: string
  /** Body text. Default "Get notified about important updates." */
  description?: string
  /** Button label. Default "Enable notifications". */
  buttonLabel?: string
  /** Theme overrides. */
  theme?: WidgetTheme
  /** Called after a successful subscribe + register. */
  onSubscribe?: (result: SubscribeWebPushResult) => void
  /** Called on any failure (permission denied, unsupported, network). */
  onError?: (error: unknown) => void
}

/**
 * Render a web-push opt-in card. Hides itself automatically when the browser
 * doesn't support push, or once permission is already `granted`/`denied`.
 */
export function mountPushPrompt(options: PushPromptOptions): WidgetHandle {
  ensureStyles()
  const host = resolveTarget(options.target)

  const root = el("div", "np-w")
  applyTheme(root, options.theme)

  const card = el("div", "np-prompt")
  const body = el("div", "np-prompt-body")
  body.appendChild(el("p", "np-prompt-title", options.title ?? "Stay in the loop"))
  body.appendChild(
    el("p", "np-prompt-text", options.description ?? "Get notified about important updates."),
  )
  const msg = el("p", "np-prompt-msg")
  msg.hidden = true
  body.appendChild(msg)

  const button = el("button", "np-btn", options.buttonLabel ?? "Enable notifications")
  button.type = "button"

  card.appendChild(body)
  card.appendChild(button)
  root.appendChild(card)

  // Hide entirely when push can't work or the decision is already made.
  const supported =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  if (!supported || (supported && Notification.permission !== "default")) {
    root.hidden = true
  }

  host.appendChild(root)

  const setMsg = (text: string, kind: "err" | "ok") => {
    msg.textContent = text
    msg.className = `np-prompt-msg np-${kind}`
    msg.hidden = false
  }

  const onClick = async () => {
    button.disabled = true
    button.textContent = "Enabling…"
    msg.hidden = true
    try {
      const result = await subscribeWebPush({
        publicKey: options.publicKey,
        appId: options.appId,
        userId: options.userId,
        serviceWorkerPath: options.serviceWorkerPath,
        baseUrl: options.baseUrl,
      })
      setMsg("Notifications enabled.", "ok")
      button.hidden = true
      options.onSubscribe?.(result)
    } catch (error) {
      button.disabled = false
      button.textContent = options.buttonLabel ?? "Enable notifications"
      setMsg(messageFor(error), "err")
      options.onError?.(error)
    }
  }

  button.addEventListener("click", onClick)

  return {
    unmount() {
      button.removeEventListener("click", onClick)
      root.remove()
    },
  }
}

function messageFor(error: unknown): string {
  const code = (error as { code?: string })?.code
  if (code === "permission_denied") return "Notifications are blocked in your browser settings."
  if (code === "web_push_unsupported") return "This browser doesn't support push notifications."
  return (error as Error)?.message ?? "Something went wrong. Please try again."
}

// ─── Inbox bell ─────────────────────────────────────────────────────────────

/** Options for {@link mountInboxBell}. */
export interface InboxBellOptions {
  /** Where to mount (selector or element). */
  target: WidgetTarget
  /** Public API key (`pk_...`). */
  publicKey: string
  /** End-user id whose inbox to show. */
  userId: string
  /** Override the API base URL. */
  baseUrl?: string
  /** Max items to load in the dropdown. Default 20. */
  limit?: number
  /**
   * Unread-count poll interval in ms. Default 30000 (30s). Set 0 to disable
   * polling (call `refresh()` yourself).
   */
  pollIntervalMs?: number
  /** Theme overrides. */
  theme?: WidgetTheme
  /**
   * Called when an item is clicked. Return `false` to suppress the default
   * behavior (navigating to the item's `deepLink`). The item is marked read
   * regardless.
   */
  onItemClick?: (item: InboxItem) => boolean | void
}

/** Handle for the inbox bell, with a manual refresh. */
export interface InboxBellHandle extends WidgetHandle {
  /** Re-fetch the unread count now (and the list if the panel is open). */
  refresh(): Promise<void>
}

/**
 * Render a notification bell with an unread badge and a dropdown inbox.
 * Polls the unread count, lazy-loads the list when opened, and marks items
 * read on click.
 */
export function mountInboxBell(options: InboxBellOptions): InboxBellHandle {
  ensureStyles()
  const host = resolveTarget(options.target)
  const limit = options.limit ?? 20
  const pollMs = options.pollIntervalMs ?? 30_000

  // Build the inbox client directly off an HttpClient so the `Public` auth
  // scheme is auto-detected from the `pk_` key (the `Nitroping` class forces
  // the `ApiKey` scheme, which the public endpoints reject).
  const http = new HttpClient({ apiKey: options.publicKey, baseUrl: options.baseUrl })
  const inbox = new InboxClient(http)

  const root = el("div", "np-w")
  applyTheme(root, options.theme)
  const wrap = el("div", "np-bell-wrap")

  const bell = el("button", "np-bell")
  bell.type = "button"
  bell.setAttribute("aria-label", "Notifications")
  bell.appendChild(bellIcon())
  const badge = el("span", "np-badge")
  badge.hidden = true
  bell.appendChild(badge)

  const panel = el("div", "np-panel")
  panel.hidden = true
  const head = el("div", "np-panel-head")
  head.appendChild(el("span", "np-panel-title", "Notifications"))
  const markAll = el("button", "np-mark-all", "Mark all read")
  markAll.type = "button"
  head.appendChild(markAll)
  const list = el("ul", "np-list")
  panel.appendChild(head)
  panel.appendChild(list)

  wrap.appendChild(bell)
  wrap.appendChild(panel)
  root.appendChild(wrap)
  host.appendChild(root)

  let unread = 0
  let timer: ReturnType<typeof setInterval> | undefined
  let destroyed = false

  const renderBadge = () => {
    if (unread > 0) {
      badge.textContent = unread > 99 ? "99+" : String(unread)
      badge.hidden = false
    } else {
      badge.hidden = true
    }
    markAll.disabled = unread === 0
  }

  const refreshCount = async () => {
    try {
      unread = await inbox.unreadCount(options.userId)
      if (!destroyed) renderBadge()
    } catch {
      // Network blip — keep the last known count.
    }
  }

  const renderList = (items: InboxItem[]) => {
    list.replaceChildren()
    if (items.length === 0) {
      list.appendChild(el("li", "np-empty", "You're all caught up."))
      return
    }
    for (const item of items) {
      list.appendChild(renderItem(item))
    }
  }

  const renderItem = (item: InboxItem): HTMLElement => {
    const li = el("li", `np-item${item.read ? "" : " np-unread"}`)
    if (item.title) li.appendChild(el("p", "np-item-title", item.title))
    if (item.body) li.appendChild(el("p", "np-item-body", item.body))
    if (item.insertedAt) li.appendChild(el("div", "np-item-time", formatTime(item.insertedAt)))

    li.addEventListener("click", async () => {
      const handled = options.onItemClick?.(item)
      if (!item.read) {
        li.classList.remove("np-unread")
        if (unread > 0) unread--
        renderBadge()
        inbox.markRead(options.userId, item.id).catch(() => {})
      }
      if (handled !== false && item.deepLink) {
        window.location.href = item.deepLink
      }
    })
    return li
  }

  const loadList = async () => {
    list.replaceChildren(el("li", "np-loading", "Loading…"))
    try {
      const items = await inbox.list(options.userId, { limit })
      if (!destroyed) renderList(items)
    } catch {
      if (!destroyed) list.replaceChildren(el("li", "np-empty", "Couldn't load notifications."))
    }
  }

  const open = () => {
    panel.hidden = false
    loadList()
    document.addEventListener("click", onOutside, true)
  }
  const close = () => {
    panel.hidden = true
    document.removeEventListener("click", onOutside, true)
  }
  const onOutside = (e: Event) => {
    if (!root.contains(e.target as Node)) close()
  }

  const onBell = (e: Event) => {
    e.stopPropagation()
    if (panel.hidden) open()
    else close()
  }
  const onMarkAll = async (e: Event) => {
    e.stopPropagation()
    unread = 0
    renderBadge()
    for (const li of Array.from(list.children)) li.classList.remove("np-unread")
    try {
      await inbox.markAllRead(options.userId)
    } catch {
      // best-effort; next poll reconciles
    }
  }

  bell.addEventListener("click", onBell)
  markAll.addEventListener("click", onMarkAll)

  void refreshCount()
  if (pollMs > 0) timer = setInterval(refreshCount, pollMs)

  return {
    async refresh() {
      await refreshCount()
      if (!panel.hidden) await loadList()
    },
    unmount() {
      destroyed = true
      if (timer) clearInterval(timer)
      bell.removeEventListener("click", onBell)
      markAll.removeEventListener("click", onMarkAll)
      document.removeEventListener("click", onOutside, true)
      root.remove()
    },
  }
}

// Build the bell SVG with DOM nodes (no innerHTML — avoids any markup-injection
// surface, even though this content is fully static).
function bellIcon(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("width", "18")
  svg.setAttribute("height", "18")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")
  for (const d of ["M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9", "M13.73 21a2 2 0 0 1-3.46 0"]) {
    const path = document.createElementNS(NS, "path")
    path.setAttribute("d", d)
    svg.appendChild(path)
  }
  return svg
}

// Compact relative-time formatter ("now", "5m", "2h", "3d", else a date).
function formatTime(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ""
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return "now"
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(t).toLocaleDateString()
}
