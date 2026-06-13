/**
 * `inbox` resource client.
 *
 * Mounted on `Nitroping` as `np.inbox`. Wraps the in-app notification
 * center under `/api/v1/public/inbox`. These endpoints authenticate with a
 * **public** (`pk_`) key — they're meant to be called from a client app on
 * behalf of a signed-in end user, identified by `userId` (the same opaque
 * id you pass at device registration).
 */

import type { HttpClient } from "./http"
import type { InboxItem, InboxListOptions } from "./types"

export class InboxClient {
  constructor(private readonly http: HttpClient) {}

  /** List a user's inbox, newest first. */
  async list(userId: string, options: InboxListOptions = {}): Promise<InboxItem[]> {
    const query: Record<string, string | number | boolean | undefined> = { user_id: userId }
    if (options.unreadOnly !== undefined) query["unread_only"] = options.unreadOnly
    if (options.limit !== undefined) query["limit"] = options.limit

    const res = await this.http.request<{ items: WireItem[] }>("GET", "/api/v1/public/inbox", {
      query,
    })
    return (res.items ?? []).map(fromWire)
  }

  /** Count a user's unread inbox items. */
  async unreadCount(userId: string): Promise<number> {
    const res = await this.http.request<{ unread_count: number }>(
      "GET",
      "/api/v1/public/inbox/unread_count",
      { query: { user_id: userId } },
    )
    return res.unread_count ?? 0
  }

  /** Mark a single inbox item read. */
  async markRead(userId: string, itemId: string): Promise<InboxItem> {
    const res = await this.http.request<WireItem>(
      "POST",
      `/api/v1/public/inbox/${encodeURIComponent(itemId)}/read`,
      { body: { user_id: userId } },
    )
    return fromWire(res)
  }

  /** Mark every unread inbox item read for a user. Returns the count updated. */
  async markAllRead(userId: string): Promise<number> {
    const res = await this.http.request<{ marked_read: number }>(
      "POST",
      "/api/v1/public/inbox/read_all",
      { body: { user_id: userId } },
    )
    return res.marked_read ?? 0
  }
}

interface WireItem {
  id: string
  notification_id: string
  title?: string
  body?: string
  data?: Record<string, unknown>
  deep_link?: string | null
  read: boolean
  read_at?: string | null
  inserted_at?: string
}

function fromWire(w: WireItem): InboxItem {
  return {
    id: w.id,
    notificationId: w.notification_id,
    title: w.title,
    body: w.body,
    data: w.data,
    deepLink: w.deep_link,
    read: w.read,
    readAt: w.read_at,
    insertedAt: w.inserted_at,
  }
}
