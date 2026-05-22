/*
 * Webhook.kt
 *
 * `verifyWebhook` — HMAC-SHA256 verification + envelope decoding of an
 * inbound nitroping webhook.
 *
 * Wire format (mirrors Polar / Stripe):
 *
 *     X-Nitroping-Signature: t=<unix>, v1=<hex>
 *
 * where `v1 = hex(HmacSHA256(secret, "<t>.<raw body>"))`.
 *
 * Usage from a Ktor / Spring / Vert.x handler:
 *
 *     val event = verifyWebhook(
 *         body = rawBytes,
 *         signature = call.request.header("X-Nitroping-Signature"),
 *         secret = System.getenv("NITROPING_WEBHOOK_SECRET"),
 *     )
 *
 *     when (event.type) {
 *         "notification.delivered" -> ...
 *         "notification.failed" -> ...
 *     }
 *
 * Throws:
 *   - `MissingSignatureHeaderException` — header missing
 *   - `InvalidSignatureException` — header malformed OR HMAC mismatch
 *   - `TimestampOutOfRangeException` — signature OK but `t=` outside tolerance
 *   - `NitropingException` (`invalid_body`) — body wasn't valid JSON
 */

package dev.nitroping.webhooks

import dev.nitroping.InvalidSignatureException
import dev.nitroping.MissingSignatureHeaderException
import dev.nitroping.NitropingException
import dev.nitroping.TimestampOutOfRangeException
import dev.nitroping.WebhookEvent
import dev.nitroping.internal.Json
import kotlin.math.abs

/** Default tolerance for the `t=` timestamp, in seconds. */
public const val DEFAULT_TOLERANCE_SECONDS: Long = 300L

/**
 * Verify a webhook signature and decode the event envelope.
 *
 * @param body raw request body bytes (do NOT re-stringify a parsed JSON
 *             object — whitespace and key order matter to the HMAC).
 * @param signature contents of the `X-Nitroping-Signature` header.
 * @param secret webhook signing secret (from the Webhooks tab in the panel).
 * @param tolerance maximum drift between `t=` and `now`, in seconds.
 *                  Default 300 (five minutes); set lower for stricter
 *                  replay defense.
 * @param now override "now" — used in tests + when replaying a saved
 *            request during incident investigation. Unix seconds.
 */
public fun verifyWebhook(
    body: ByteArray,
    signature: String?,
    secret: String,
    tolerance: Long = DEFAULT_TOLERANCE_SECONDS,
    now: Long = System.currentTimeMillis() / 1000L,
): WebhookEvent {
    if (signature.isNullOrBlank()) throw MissingSignatureHeaderException()

    val parsed = parseSignatureHeader(signature)
        ?: throw InvalidSignatureException("Malformed X-Nitroping-Signature header")

    val bodyString = body.toString(Charsets.UTF_8)
    val signed = "${parsed.t}.$bodyString"
    val expected = Signature.hmacSha256Hex(secret, signed)

    if (!Signature.constantTimeEqualHex(expected, parsed.v1)) {
        throw InvalidSignatureException()
    }

    if (abs(now - parsed.t) > tolerance) {
        throw TimestampOutOfRangeException(
            "Webhook timestamp ${parsed.t} is more than ${tolerance}s from now ($now)"
        )
    }

    val parsedJson = try {
        Json.decode(bodyString)
    } catch (e: Throwable) {
        throw NitropingException(
            "Webhook body is not valid JSON",
            code = "invalid_body",
            cause = e,
        )
    }

    @Suppress("UNCHECKED_CAST")
    val asMap = parsedJson as? Map<String, Any?>
        ?: throw NitropingException("Webhook body must be a JSON object", code = "invalid_body")

    @Suppress("UNCHECKED_CAST")
    val dataMap = (asMap["data"] as? Map<String, Any?>) ?: emptyMap()

    return WebhookEvent(
        id = asMap["id"] as? String
            ?: throw NitropingException("Webhook body missing `id`", code = "invalid_body"),
        type = asMap["type"] as? String
            ?: throw NitropingException("Webhook body missing `type`", code = "invalid_body"),
        createdAt = asMap["created_at"] as? String
            ?: throw NitropingException("Webhook body missing `created_at`", code = "invalid_body"),
        data = dataMap,
    )
}

/**
 * String body convenience — UTF-8 encode + delegate to the [ByteArray]
 * overload.
 */
public fun verifyWebhook(
    body: String,
    signature: String?,
    secret: String,
    tolerance: Long = DEFAULT_TOLERANCE_SECONDS,
    now: Long = System.currentTimeMillis() / 1000L,
): WebhookEvent = verifyWebhook(
    body = body.toByteArray(Charsets.UTF_8),
    signature = signature,
    secret = secret,
    tolerance = tolerance,
    now = now,
)

/**
 * Compute the `X-Nitroping-Signature` header value for [body] with [secret]
 * at [timestamp]. Mostly useful for tests; production code only verifies
 * incoming requests.
 */
public fun signWebhook(secret: String, body: String, timestamp: Long): String {
    val v1 = Signature.hmacSha256Hex(secret, "$timestamp.$body")
    return "t=$timestamp, v1=$v1"
}

// ── Internals ───────────────────────────────────────────────────────────

internal data class ParsedSignature(val t: Long, val v1: String)

internal fun parseSignatureHeader(header: String): ParsedSignature? {
    // Format: "t=<unix>, v1=<hex>". Tolerant of extra whitespace and key
    // ordering — match by key, not position.
    var t: Long? = null
    var v1: String? = null
    for (rawPart in header.split(',')) {
        val part = rawPart.trim()
        val eq = part.indexOf('=')
        if (eq <= 0) continue
        val key = part.substring(0, eq).trim()
        val value = part.substring(eq + 1).trim()
        when (key) {
            "t" -> t = value.toLongOrNull() ?: return null
            "v1" -> {
                if (!value.matches(Regex("^[0-9a-fA-F]+$"))) return null
                v1 = value.lowercase()
            }
        }
    }
    if (t == null || v1 == null) return null
    return ParsedSignature(t = t, v1 = v1)
}
