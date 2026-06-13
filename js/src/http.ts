/**
 * Internal `fetch` wrapper.
 *
 * Adds the `Authorization` header, JSON serializes the body, parses
 * the JSON response, and maps non-2xx envelopes (`{error: {code,
 * message, details}}`) into `NitropingError`. `fetch` itself failing
 * (DNS, TLS, offline, abort) becomes a `NetworkError`.
 *
 * Zero runtime deps — uses the platform's global `fetch`, `URL`, and
 * `AbortController`. Works in Node 18+, Bun, Deno, Cloudflare Workers
 * and modern browsers.
 */

import { NetworkError, NitropingError } from "./errors"

/** Default base URL pointing at the hosted nitroping service. */
export const DEFAULT_BASE_URL = "https://nitroping.dev"

/**
 * SDK version, surfaced in the default `User-Agent`. Keep in sync with
 * `package.json` (the repo-root `bump.sh` updates both on release).
 */
export const SDK_VERSION = "0.2.10"

/**
 * Constructor options shared between server and public-key clients.
 */
export interface HttpClientOptions {
  /**
   * Secret API key (`np_...`) or public key (`pk_...`). Sent in the
   * `Authorization` header. The scheme (`ApiKey` vs `Public`) is set
   * by `authScheme`.
   */
  apiKey: string
  /** Base URL. Defaults to `https://nitroping.dev`. */
  baseUrl?: string
  /**
   * Per-request timeout in milliseconds. Default: 30_000.
   *
   * Set to `0` to disable. Implemented with `AbortController` so it
   * works in every runtime.
   */
  timeoutMs?: number
  /** Custom `fetch` implementation. Useful for dependency injection in tests. */
  fetch?: typeof fetch
  /**
   * Authorization scheme. `ApiKey` for the server SDK, `Public` for
   * the browser-side public-key flow.
   */
  authScheme?: "ApiKey" | "Public"
  /**
   * Custom `User-Agent` header. Ignored in browsers (the runtime sets
   * it itself).
   */
  userAgent?: string
  /**
   * Debug logging. The SDK is silent by default. Set:
   *   * `true`  → log each request/response to `console.debug`.
   *   * a function → receive structured `{ phase, ... }` events to route
   *     anywhere (your own logger, Sentry breadcrumbs, etc.).
   * The `Authorization` header and the API key are always redacted.
   */
  debug?: boolean | DebugLogger
}

/** A structured debug event emitted by the HTTP client. */
export type DebugEvent =
  | {
      phase: "request"
      method: string
      url: string
      headers: Record<string, string>
      body?: unknown
    }
  | { phase: "response"; method: string; url: string; status: number; ms: number; body?: unknown }
  | { phase: "error"; method: string; url: string; ms: number; error: string }

/** Debug sink. Receives one event per request lifecycle step. */
export type DebugLogger = (event: DebugEvent) => void

/** Internal: a structured HTTP client. */
export class HttpClient {
  readonly baseUrl: string
  readonly apiKey: string
  readonly timeoutMs: number
  readonly fetchImpl: typeof fetch
  readonly authScheme: "ApiKey" | "Public"
  readonly userAgent: string
  private readonly debug?: DebugLogger

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey) {
      throw new NitropingError("apiKey is required", { code: "invalid_argument" })
    }
    this.apiKey = opts.apiKey
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.timeoutMs = opts.timeoutMs ?? 30_000
    this.authScheme = opts.authScheme ?? (opts.apiKey.startsWith("pk_") ? "Public" : "ApiKey")
    this.userAgent = opts.userAgent ?? `nitroping-js/${SDK_VERSION}`
    this.debug = resolveDebug(opts.debug)

    const f = opts.fetch ?? globalThis.fetch
    if (typeof f !== "function") {
      throw new NitropingError(
        "Global `fetch` is not available. Pass a `fetch` implementation in the SDK constructor options.",
        { code: "fetch_unavailable" },
      )
    }
    this.fetchImpl = f.bind(globalThis)
  }

  /** Perform an HTTP request and parse the JSON envelope. */
  async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown
      headers?: Record<string, string>
      query?: Record<string, string | number | boolean | undefined>
    } = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.query)

    const headers: Record<string, string> = {
      Authorization: `${this.authScheme} ${this.apiKey}`,
      Accept: "application/json",
      ...options.headers,
    }

    let bodyText: string | undefined
    if (options.body !== undefined) {
      bodyText = JSON.stringify(options.body)
      headers["Content-Type"] = "application/json"
    }

    // Don't override the runtime's User-Agent in browsers (they reject
    // it). Only set it where the header is fully writable.
    if (typeof window === "undefined" && this.userAgent && !headers["User-Agent"]) {
      headers["User-Agent"] = this.userAgent
    }

    const controller = this.timeoutMs > 0 ? new AbortController() : undefined
    const timer =
      controller !== undefined ? setTimeout(() => controller.abort(), this.timeoutMs) : undefined

    const startedAt = nowMs()
    this.debug?.({
      phase: "request",
      method,
      url,
      headers: redactHeaders(headers),
      body: options.body,
    })

    let response: Response
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        body: bodyText,
        signal: controller?.signal,
      })
    } catch (cause) {
      this.debug?.({
        phase: "error",
        method,
        url,
        ms: nowMs() - startedAt,
        error: (cause as Error)?.message ?? String(cause),
      })
      throw new NetworkError(
        `Request to ${url} failed: ${(cause as Error)?.message ?? cause}`,
        cause,
      )
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }

    try {
      const { value, raw } = await parseResponse<T>(response)
      this.debug?.({
        phase: "response",
        method,
        url,
        status: response.status,
        ms: nowMs() - startedAt,
        body: raw,
      })
      return value
    } catch (err) {
      // HTTP error envelope (NitropingError) — log it as a response phase so
      // debug users see the status + server code, then rethrow unchanged.
      this.debug?.({
        phase: "response",
        method,
        url,
        status: response.status,
        ms: nowMs() - startedAt,
        body: err instanceof NitropingError ? { code: err.code, message: err.message } : undefined,
      })
      throw err
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, `${this.baseUrl}/`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }
    return url.toString()
  }
}

async function parseResponse<T>(response: Response): Promise<{ value: T; raw: unknown }> {
  const text = await response.text()
  let json: unknown = undefined
  if (text.length > 0) {
    try {
      json = JSON.parse(text)
    } catch {
      // Non-JSON body — pass through as raw text in the error.
      if (!response.ok) {
        throw new NitropingError(
          `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 200)}`,
          { status: response.status, code: `http_${response.status}` },
        )
      }
      return { value: text as unknown as T, raw: text }
    }
  }

  if (!response.ok) {
    const envelope = (json ?? {}) as {
      error?: { code?: string; message?: string; details?: unknown }
    }
    const err = envelope.error ?? {}
    throw new NitropingError(err.message ?? `HTTP ${response.status}`, {
      status: response.status,
      code: err.code ?? `http_${response.status}`,
      details: err.details,
    })
  }

  return { value: json as T, raw: json }
}

/** High-resolution-ish monotonic ms, falling back to Date.now(). */
function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now()
}

/** Strip the Authorization header before it ever reaches a log sink. */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = k.toLowerCase() === "authorization" ? "[redacted]" : v
  }
  return out
}

/** Normalize the `debug` option into a logger (or undefined when off). */
function resolveDebug(debug?: boolean | DebugLogger): DebugLogger | undefined {
  if (!debug) return undefined
  if (typeof debug === "function") return debug
  return (event) => {
    // Default sink: a single console.debug line per event.
    const label = `[nitroping] ${event.phase} ${event.method} ${event.url}`
    if (event.phase === "response") {
      console.debug(`${label} → ${event.status} (${Math.round(event.ms)}ms)`, event.body ?? "")
    } else if (event.phase === "error") {
      console.debug(`${label} ✗ ${event.error} (${Math.round(event.ms)}ms)`)
    } else {
      console.debug(label, event.body ?? "")
    }
  }
}
