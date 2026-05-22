/*
 * WebhooksTest.kt
 *
 * Mirrors `js/test/webhooks.test.ts` — same secret, same locked vector,
 * same edge cases (tampered body, missing header, malformed header, old
 * timestamp, wider tolerance).
 *
 * The locked vector at the bottom guarantees the Kotlin HMAC matches the
 * Elixir server's HMAC byte-for-byte. If it ever drifts the test fails
 * loudly with the expected hex on the diff.
 */

package dev.nitroping

import dev.nitroping.webhooks.parseSignatureHeader
import dev.nitroping.webhooks.signWebhook
import dev.nitroping.webhooks.verifyWebhook
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WebhooksTest {
    private val secret = "whsec_test_0123456789abcdef"

    @Test fun `accepts a valid signature and returns the parsed event`() {
        val event = """{"id":"evt_abc","type":"notification.delivered","created_at":"2026-05-22T10:00:00Z","data":{"notification_id":"n1"}}"""
        val t = 1_700_000_000L
        val header = signWebhook(secret, event, t)

        val result = verifyWebhook(body = event, signature = header, secret = secret, now = t)
        assertEquals("evt_abc", result.id)
        assertEquals("notification.delivered", result.type)
        assertEquals("2026-05-22T10:00:00Z", result.createdAt)
        assertEquals("n1", result.data["notification_id"])
    }

    @Test fun `matches the t=unix, v1=hex format from the server`() {
        val header = signWebhook(secret, "{}", 1_700_000_000L)
        assertTrue(header.matches(Regex("^t=\\d+, v1=[0-9a-f]+\$")), "header was '$header'")
        assertTrue(header.startsWith("t=1700000000, v1="))
    }

    @Test fun `throws InvalidSignatureException when the body has been tampered`() {
        val t = 1_700_000_000L
        val header = signWebhook(secret, """{"ok":true}""", t)
        assertThrows<InvalidSignatureException> {
            verifyWebhook(body = """{"ok":false}""", signature = header, secret = secret, now = t)
        }
    }

    @Test fun `throws InvalidSignatureException when the secret is wrong`() {
        val t = 1_700_000_000L
        val body = """{"ok":true}"""
        val header = signWebhook(secret, body, t)
        assertThrows<InvalidSignatureException> {
            verifyWebhook(body = body, signature = header, secret = "whsec_wrong", now = t)
        }
    }

    @Test fun `throws TimestampOutOfRangeException when timestamp is older than tolerance`() {
        val signedAt = 1_700_000_000L
        val body = """{"ok":true}"""
        val header = signWebhook(secret, body, signedAt)

        assertThrows<TimestampOutOfRangeException> {
            verifyWebhook(body = body, signature = header, secret = secret, now = signedAt + 1000L)
        }
    }

    @Test fun `accepts a wider tolerance to bypass timestamp check`() {
        val signedAt = 1_700_000_000L
        val body = """{"id":"evt_x","type":"webhook.test","created_at":"2026-05-22T10:00:00Z","data":{}}"""
        val header = signWebhook(secret, body, signedAt)

        val result = verifyWebhook(
            body = body,
            signature = header,
            secret = secret,
            now = signedAt + 86_400L,
            tolerance = 90_000L,
        )
        assertEquals("evt_x", result.id)
    }

    @Test fun `throws MissingSignatureHeaderException on null header`() {
        assertThrows<MissingSignatureHeaderException> {
            verifyWebhook(body = "{}", signature = null, secret = secret)
        }
    }

    @Test fun `throws MissingSignatureHeaderException on blank header`() {
        assertThrows<MissingSignatureHeaderException> {
            verifyWebhook(body = "{}", signature = "   ", secret = secret)
        }
    }

    @Test fun `throws InvalidSignatureException on a malformed header`() {
        assertThrows<InvalidSignatureException> {
            verifyWebhook(body = "{}", signature = "not-a-real-header", secret = secret)
        }
    }

    @Test fun `throws NitropingException with invalid_body code when payload is not JSON`() {
        val t = 1_700_000_000L
        val header = signWebhook(secret, "not-json", t)
        val err = assertThrows<NitropingException> {
            verifyWebhook(body = "not-json", signature = header, secret = secret, now = t)
        }
        assertEquals("invalid_body", err.code)
    }

    @Test fun `matches the Elixir server's reference HMAC exactly`() {
        // Locked-in vector — matches `js/test/webhooks.test.ts` line-for-line.
        //   secret = "0123456789abcdef"
        //   body = '{"hello":"world"}'
        //   t = 1700000000
        // Computed via Elixir:
        //   :crypto.mac(:hmac, :sha256, "0123456789abcdef", "1700000000.{\"hello\":\"world\"}")
        //   |> Base.encode16(case: :lower)
        val sec = "0123456789abcdef"
        val body = """{"hello":"world"}"""
        val t = 1_700_000_000L
        val header = signWebhook(sec, body, t)

        assertEquals(
            "t=1700000000, v1=66997eb7c1d13335f141deda66669e544a2c7f62745300308aec8f7042fb18be",
            header,
        )

        // Body needs to also be a valid event envelope for verifyWebhook to
        // return; the locked HMAC test above already proves byte-for-byte
        // match, so this asserts only that the signature *verifies* (we
        // construct a real envelope and re-sign).
        val event = """{"id":"evt_1","type":"webhook.test","created_at":"2026-05-22T10:00:00Z","data":{"hello":"world"}}"""
        val evHeader = signWebhook(sec, event, t)
        val parsed = verifyWebhook(body = event, signature = evHeader, secret = sec, now = t)
        assertEquals("evt_1", parsed.id)
        assertEquals("world", parsed.data["hello"])
    }

    @Test fun `parseSignatureHeader is tolerant of key order and whitespace`() {
        val a = parseSignatureHeader("t=1700000000, v1=abcdef")
        val b = parseSignatureHeader(" v1=abcdef , t=1700000000 ")
        assertNotNull(a)
        assertNotNull(b)
        assertEquals(1_700_000_000L, a!!.t)
        assertEquals("abcdef", a.v1)
        assertEquals(1_700_000_000L, b!!.t)
        assertEquals("abcdef", b.v1)
    }

    @Test fun `parseSignatureHeader returns null when v1 is not hex`() {
        assertNull(parseSignatureHeader("t=1700000000, v1=not-hex"))
        assertNull(parseSignatureHeader("t=1700000000"))
        assertNull(parseSignatureHeader("v1=abcdef"))
    }
}
