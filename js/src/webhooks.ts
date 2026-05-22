/**
 * `nitroping/webhooks` — verify outbound webhook signatures.
 *
 * The nitroping server signs every outbound webhook with HMAC-SHA256
 * and ships the result in the `X-Nitroping-Signature` header. The
 * header format mirrors Polar / Stripe:
 *
 *     X-Nitroping-Signature: t=1700000000, v1=<hex>
 *
 * where `v1 = HMAC-SHA256(<t>.<raw body>, secret)`.
 *
 * @example
 * ```ts
 * import { verifyWebhook } from "nitroping/webhooks"
 *
 * const event = await verifyWebhook({
 *   body: rawString,
 *   signature: req.headers["x-nitroping-signature"],
 *   secret: process.env.NITROPING_WEBHOOK_SECRET!,
 * })
 *
 * console.log(event.type) // "notification.delivered"
 * ```
 *
 * Zero deps — uses the universal `crypto.subtle` Web Crypto API
 * (available in Node 18+, Bun, Deno, Workers, browsers).
 */

import { InvalidSignatureError, NitropingError, TimestampOutOfRangeError } from "./errors"
import type { WebhookEvent } from "./types"

export type { WebhookEvent } from "./types"

/** Options accepted by `verifyWebhook`. */
export interface VerifyWebhookOptions {
  /**
   * Raw request body, exactly as received (do **not** re-stringify a
   * parsed JSON object — whitespace and key order matter to the HMAC).
   *
   * `Uint8Array` is accepted for non-UTF-8-safe pipelines, but the
   * standard path is a UTF-8 string read off the request before
   * JSON-parsing it.
   */
  body: string | Uint8Array
  /**
   * The `X-Nitroping-Signature` header value, or `null` / `undefined`
   * if the header was missing (treated as `InvalidSignatureError`).
   */
  signature: string | string[] | null | undefined
  /** Webhook signing secret, configured in the app panel. */
  secret: string
  /**
   * Maximum drift between `t=` and the verifier's wall clock, in
   * seconds. Default: 300 (five minutes). Set lower for stricter
   * replay defense.
   */
  tolerance?: number
  /**
   * Override "now" — useful for tests + replaying a saved request
   * during incident investigation.
   */
  now?: Date | number
}

/**
 * Verify and parse a webhook delivery.
 *
 * Returns the parsed `WebhookEvent` on success. Throws:
 *
 *   - `InvalidSignatureError` — header missing, malformed, or HMAC mismatch
 *   - `TimestampOutOfRangeError` — signature valid but `t=` outside `tolerance`
 *   - `NitropingError` — body wasn't valid JSON
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<WebhookEvent> {
  const tolerance = options.tolerance ?? 300
  const now = toUnixSeconds(options.now ?? new Date())

  const header = pickHeader(options.signature)
  if (!header) throw new InvalidSignatureError("Missing X-Nitroping-Signature header")

  const parsed = parseSignatureHeader(header)
  if (!parsed) {
    throw new InvalidSignatureError("Malformed X-Nitroping-Signature header")
  }

  const rawBody = typeof options.body === "string" ? options.body : utf8Decode(options.body)

  const expected = await hmacSha256Hex(options.secret, `${parsed.t}.${rawBody}`)

  if (!timingSafeEqualHex(expected, parsed.v1)) {
    throw new InvalidSignatureError()
  }

  if (Math.abs(now - parsed.t) > tolerance) {
    throw new TimestampOutOfRangeError(
      `Webhook timestamp ${parsed.t} is more than ${tolerance}s from now (${now})`,
    )
  }

  let event: unknown
  try {
    event = JSON.parse(rawBody)
  } catch (cause) {
    throw new NitropingError("Webhook body is not valid JSON", {
      code: "invalid_body",
      cause,
    })
  }

  return event as WebhookEvent
}

/**
 * Compute a header value for the nitroping signing scheme. Mostly
 * useful for tests; production code should rely on the server.
 */
export async function signWebhook(
  secret: string,
  body: string,
  timestamp?: Date | number,
): Promise<string> {
  const t = toUnixSeconds(timestamp ?? new Date())
  const v1 = await hmacSha256Hex(secret, `${t}.${body}`)
  return `t=${t}, v1=${v1}`
}

function pickHeader(input: string | string[] | null | undefined): string | undefined {
  if (input === null || input === undefined) return undefined
  if (Array.isArray(input)) return input[0]
  return input
}

function parseSignatureHeader(header: string): { t: number; v1: string } | undefined {
  // Format: "t=<unix>, v1=<hex>". Be tolerant of extra whitespace and
  // ordering — match by key.
  const parts = header.split(",").map((s) => s.trim())
  let t: number | undefined
  let v1: string | undefined
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === "t") {
      const n = Number.parseInt(value, 10)
      if (!Number.isFinite(n)) return undefined
      t = n
    } else if (key === "v1") {
      if (!/^[0-9a-f]+$/i.test(value)) return undefined
      v1 = value.toLowerCase()
    }
  }
  if (t === undefined || v1 === undefined) return undefined
  return { t, v1 }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const keyBytes = enc.encode(secret)
  const msgBytes = enc.encode(message)

  const cryptoObj = globalThis.crypto
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new NitropingError(
      "Web Crypto (crypto.subtle) is not available in this runtime. Node 18+, Bun, Deno, and modern browsers all provide it.",
      { code: "subtle_unavailable" },
    )
  }

  const key = await cryptoObj.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await cryptoObj.subtle.sign("HMAC", key, msgBytes)
  return bufferToHex(sig)
}

function bufferToHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  let out = ""
  for (let i = 0; i < view.length; i++) {
    const b = view[i]!
    out += (b < 16 ? "0" : "") + b.toString(16)
  }
  return out
}

/** Constant-time comparison of two lowercase hex strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function toUnixSeconds(value: Date | number): number {
  if (typeof value === "number") {
    // Heuristic: anything past year 9999 in seconds is in ms.
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
  }
  return Math.floor(value.getTime() / 1000)
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes)
}
