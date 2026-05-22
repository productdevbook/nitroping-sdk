/*
 * Errors.kt
 *
 * Error hierarchy for the Nitroping Kotlin SDK.
 *
 * All public functions throw a `NitropingException` or one of its subclasses.
 * Catch the base class to handle every error, or narrow with `is`/`when` on
 * the specific subclass when you want to switch on a known failure mode
 * (retry on `NetworkException`, surface a 4xx with a typed `ApiException`,
 * etc.).
 *
 * Field shapes mirror what the JS SDK's `NitropingError` exposes — `status`
 * (when present), a stable `code` string from the server envelope, and a
 * free-form `details` payload (the field-level validation map).
 */

package dev.nitroping

/**
 * Base exception thrown by every SDK function.
 *
 * Subclasses set `code` and may add structured fields. `code` is the stable
 * machine-readable identifier mirrored from the server envelope (e.g.
 * `invalid_api_key`, `validation_failed`, `quota_exceeded`). SDK-internal
 * failures use codes like `network_error` or `invalid_signature`.
 */
public open class NitropingException(
    message: String,
    /** Optional HTTP status, when the failure came from a response. */
    public val status: Int? = null,
    /** Stable, machine-readable code (`error.code` from the server envelope). */
    public val code: String = "error",
    /** Free-form details — typically the server's per-field validation map. */
    public val details: Any? = null,
    cause: Throwable? = null,
) : RuntimeException(message, cause)

/**
 * Thrown when the HTTP request itself failed (DNS, TLS, refused connection,
 * I/O timeout). The underlying error is attached via `cause`.
 */
public class NetworkException(
    message: String,
    cause: Throwable? = null,
) : NitropingException(message, code = "network_error", cause = cause)

/**
 * Thrown when the server returned a non-2xx response. Carries the parsed
 * envelope (`status`, `code`, `details`) so callers can switch on a typed
 * server error without parsing the JSON themselves.
 */
public class ApiException(
    message: String,
    status: Int,
    code: String,
    details: Any? = null,
) : NitropingException(message, status = status, code = code, details = details)

/**
 * Thrown by `verifyWebhook` when the computed HMAC does not match the `v1=`
 * value in the `X-Nitroping-Signature` header, or the header has the wrong
 * shape.
 */
public class InvalidSignatureException(
    message: String = "Webhook signature does not match request body",
) : NitropingException(message, code = "invalid_signature")

/**
 * Thrown by `verifyWebhook` when the signature is well-formed and matches
 * the body, but its `t=` timestamp is outside the tolerance window. Defends
 * against signature replay.
 */
public class TimestampOutOfRangeException(
    message: String = "Webhook timestamp is outside the allowed tolerance",
) : NitropingException(message, code = "timestamp_out_of_range")

/**
 * Thrown by `verifyWebhook` when the `X-Nitroping-Signature` header is
 * missing entirely. (A *malformed* header is reported as
 * `InvalidSignatureException` to keep the surface compatible with the other
 * language SDKs.)
 */
public class MissingSignatureHeaderException(
    message: String = "Missing X-Nitroping-Signature header",
) : NitropingException(message, code = "missing_signature")
