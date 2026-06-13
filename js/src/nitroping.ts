/**
 * `Nitroping` — the main server-side SDK entry point.
 *
 * @example
 * ```ts
 * import { Nitroping } from "nitroping"
 *
 * const np = new Nitroping({ apiKey: process.env.NITROPING_API_KEY! })
 *
 * await np.notifications.send({
 *   title: "Order #4129 shipped",
 *   body: "On its way",
 *   target: { all: true },
 * })
 * ```
 */

import { DevicesClient } from "./devices"
import { NitropingError } from "./errors"
import { EventsClient } from "./events"
import { InboxClient } from "./inbox"
import { HttpClient, type HttpClientOptions } from "./http"
import { NotificationsClient } from "./notifications"
import { TrackClient } from "./track"

/** Constructor options for `Nitroping`. */
export interface NitropingOptions extends Omit<HttpClientOptions, "apiKey" | "authScheme"> {
  /**
   * Secret API key (`np_...`).
   *
   * Falls back to `process.env.NITROPING_API_KEY` when omitted (Node /
   * Bun / Deno only — browser code should pass it explicitly or, better,
   * use `nitroping/web` with a public `pk_` key).
   */
  apiKey?: string
}

export class Nitroping {
  /** `notifications` resource — send, get, cancel. */
  readonly notifications: NotificationsClient
  /** `devices` resource — register, update, deactivate. */
  readonly devices: DevicesClient
  /** `track` resource — delivery/open/click callbacks (`POST /track`). */
  readonly track: TrackClient
  /** `events` resource — public engagement events (`POST /events`). */
  readonly events: EventsClient
  /** `inbox` resource — in-app notification center (`/public/inbox`). */
  readonly inbox: InboxClient

  /** Internal HTTP client. Exposed for advanced use (custom requests). */
  readonly http: HttpClient

  constructor(options: NitropingOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("NITROPING_API_KEY")
    if (!apiKey) {
      throw new NitropingError(
        "apiKey is required. Pass it to `new Nitroping({apiKey})` or set the NITROPING_API_KEY environment variable.",
        { code: "invalid_argument" },
      )
    }

    this.http = new HttpClient({ ...options, apiKey, authScheme: "ApiKey" })
    this.notifications = new NotificationsClient(this.http)
    this.devices = new DevicesClient(this.http)
    this.track = new TrackClient(this.http)
    this.events = new EventsClient(this.http)
    this.inbox = new InboxClient(this.http)
  }
}

/**
 * Read an env var across runtimes. Node / Bun expose `process.env`,
 * Deno exposes `Deno.env.get`, Cloudflare Workers expose nothing
 * (env is per-request and must be passed explicitly).
 */
function readEnv(name: string): string | undefined {
  // Node, Bun, Deno (with --allow-env) all populate process.env.
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (proc?.env && typeof proc.env[name] === "string") {
    return proc.env[name]
  }

  // Deno without process shim.
  const deno = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno
  if (deno && typeof deno.env?.get === "function") {
    return deno.env.get(name)
  }

  return undefined
}
