/*
 * Signature.kt
 *
 * Internal HMAC-SHA256 + constant-time hex compare. Uses `javax.crypto.Mac`
 * (stdlib JVM, no deps). Matches the Elixir server's signing routine —
 * we have a locked test vector for it in WebhooksTest.
 */

package dev.nitroping.webhooks

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

internal object Signature {
    /**
     * Compute HMAC-SHA256 over [message] with [secret], encoded as
     * lowercase hex. UTF-8 byte encoding for both inputs — exactly what
     * `:crypto.mac(:hmac, :sha256, secret, "t.body")` does on the Elixir
     * side.
     */
    fun hmacSha256Hex(secret: String, message: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val digest = mac.doFinal(message.toByteArray(Charsets.UTF_8))
        return digest.toHexLower()
    }

    /**
     * Constant-time comparison of two lowercase hex strings. Length
     * mismatch short-circuits to `false`; otherwise we OR every char-diff
     * into an accumulator before returning. The hot loop is byte-aligned
     * so timing leaks the only the *length*, never the content.
     */
    fun constantTimeEqualHex(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) {
            diff = diff or (a[i].code xor b[i].code)
        }
        return diff == 0
    }

    private fun ByteArray.toHexLower(): String {
        val sb = StringBuilder(size * 2)
        for (b in this) {
            val v = b.toInt() and 0xff
            sb.append(HEX_DIGITS[v ushr 4])
            sb.append(HEX_DIGITS[v and 0x0f])
        }
        return sb.toString()
    }

    private val HEX_DIGITS = "0123456789abcdef".toCharArray()
}
