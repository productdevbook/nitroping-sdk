/**
 * Error hierarchy for the nitroping SDK.
 *
 * All public functions throw subclasses of `NitropingError`. Catch the
 * base class to handle every error, or narrow by `instanceof` on the
 * specific subclass when you want to switch on a known failure mode
 * (e.g. retry on `NetworkError`, surface a UI prompt on
 * `PermissionDeniedError`).
 */

/**
 * Base error thrown by every SDK function. Subclasses set `name` and may
 * add structured fields (`status`, `code`, `details`).
 */
export class NitropingError extends Error {
  override readonly name: string = "NitropingError"

  /** Optional HTTP status if this error originated from a response. */
  readonly status?: number

  /**
   * Stable machine-readable code, mirrored from the server envelope
   * (`error.code`). Examples: `"invalid_api_key"`, `"validation_failed"`,
   * `"quota_exceeded"`. SDK-internal failures use codes like
   * `"network_error"` or `"invalid_signature"`.
   */
  readonly code: string

  /**
   * Free-form details object — typically the server's
   * `error.details` (field-level validation errors).
   */
  readonly details?: unknown

  constructor(
    message: string,
    options: { status?: number; code?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.status = options.status
    this.code = options.code ?? "error"
    this.details = options.details
  }
}

/**
 * Thrown when `fetch` itself rejects (DNS, TLS, abort, offline). The
 * underlying error is attached via `cause`.
 */
export class NetworkError extends NitropingError {
  override readonly name = "NetworkError"

  constructor(message: string, cause?: unknown) {
    super(message, { code: "network_error", cause })
  }
}

/**
 * Thrown by `verifyWebhook` when the computed HMAC does not match the
 * `v1=` value in the `X-Nitroping-Signature` header, or the header is
 * missing / malformed.
 */
export class InvalidSignatureError extends NitropingError {
  override readonly name = "InvalidSignatureError"

  constructor(message = "Webhook signature does not match request body") {
    super(message, { code: "invalid_signature" })
  }
}

/**
 * Thrown by `verifyWebhook` when the signature is well-formed and
 * matches the body, but its `t=` timestamp is outside the tolerance
 * window. Defends against signature replay.
 */
export class TimestampOutOfRangeError extends NitropingError {
  override readonly name = "TimestampOutOfRangeError"

  constructor(message = "Webhook timestamp is outside the allowed tolerance") {
    super(message, { code: "timestamp_out_of_range" })
  }
}

/**
 * Thrown by `subscribeWebPush` when the browser lacks one of the
 * required APIs (Service Worker, Push API, `crypto.subtle`).
 */
export class WebPushUnsupportedError extends NitropingError {
  override readonly name = "WebPushUnsupportedError"

  constructor(message = "Web Push is not supported in this environment") {
    super(message, { code: "web_push_unsupported" })
  }
}

/**
 * Thrown by `subscribeWebPush` when the user (or browser policy)
 * denies the notification permission.
 */
export class PermissionDeniedError extends NitropingError {
  override readonly name = "PermissionDeniedError"

  constructor(message = "Notification permission was denied") {
    super(message, { code: "permission_denied" })
  }
}
