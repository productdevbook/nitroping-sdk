/*
 * JsonTest.kt
 *
 * Unit tests for the internal Json writer + parser. Not strictly required
 * to ship — the public clients exercise both via NotificationsTest +
 * WebhooksTest — but a focused test keeps a debugging signal in case
 * either side regresses.
 */

package dev.nitroping

import dev.nitroping.internal.Json
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class JsonTest {
    @Test fun `encodes primitives correctly`() {
        assertEquals("null", Json.encode(null))
        assertEquals("true", Json.encode(true))
        assertEquals("false", Json.encode(false))
        assertEquals("42", Json.encode(42))
        assertEquals("42", Json.encode(42L))
        assertEquals("3.14", Json.encode(3.14))
        assertEquals("\"hi\"", Json.encode("hi"))
    }

    @Test fun `encodes nested objects and arrays`() {
        val tree = mapOf(
            "a" to 1,
            "b" to listOf("x", "y"),
            "c" to mapOf("nested" to true),
        )
        // Key order is insertion order (LinkedHashMap on input).
        assertEquals("""{"a":1,"b":["x","y"],"c":{"nested":true}}""", Json.encode(tree))
    }

    @Test fun `escapes control characters and quotes`() {
        assertEquals("\"line1\\nline2\"", Json.encode("line1\nline2"))
        assertEquals("\"she said \\\"hi\\\"\"", Json.encode("she said \"hi\""))
        assertEquals("\"\"", Json.encode(""))
        // Below-0x20 chars use the \uXXXX form (here SOH = \u0001).
        assertEquals("\"\\u0001\"", Json.encode("\u0001"))
    }

    @Test fun `round-trips a Nitroping send body`() {
        val src = """{"title":"Hi","body":"there","target":{"all":true},"actions":[{"id":"a","title":"A"}]}"""
        val tree = Json.decode(src) as Map<*, *>
        assertEquals("Hi", tree["title"])
        assertEquals("there", tree["body"])
        assertEquals(mapOf("all" to true), tree["target"])
        val actions = tree["actions"] as List<*>
        val first = actions[0] as Map<*, *>
        assertEquals("a", first["id"])
        assertEquals("A", first["title"])
    }

    @Test fun `parses numbers as Long when integral, Double otherwise`() {
        val tree = Json.decode("""{"i":42,"f":3.14}""") as Map<*, *>
        assertEquals(42L, tree["i"])
        assertEquals(3.14, tree["f"])
    }

    @Test fun `parses empty object and array`() {
        assertEquals(emptyMap<String, Any?>(), Json.decode("{}"))
        assertEquals(emptyList<Any?>(), Json.decode("[]"))
    }

    @Test fun `decode rejects malformed input`() {
        assertThrows<IllegalArgumentException> { Json.decode("{") }
        assertThrows<IllegalArgumentException> { Json.decode("not-json") }
        assertThrows<IllegalArgumentException> { Json.decode("""{"a":}""") }
    }

    @Test fun `parses null inside an object`() {
        val tree = Json.decode("""{"x":null}""") as Map<*, *>
        assertTrue(tree.containsKey("x"))
        assertNull(tree["x"])
    }

    @Test fun `decodes unicode escapes`() {
        assertEquals("café", Json.decode("\"caf\\u00e9\""))
    }
}
