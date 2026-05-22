/*
 * Json.kt
 *
 * Tiny zero-dependency JSON writer + parser.
 *
 * Rationale: matching the JS SDK's zero-runtime-deps stance is a marketing
 * promise. `kotlinx.serialization` would have been the obvious choice but
 * pulling it in for ~5 endpoints is not worth ~1MB on the classpath, an
 * extra Gradle plugin, and a "do I have to add @Serializable everywhere?"
 * teaching tax in the README.
 *
 * Scope:
 *
 *   - writer: emits objects, arrays, strings, numbers (Long/Double/Int),
 *     booleans, nulls — i.e. exactly the shapes the Nitroping API accepts.
 *     Order is insertion order (LinkedHashMap on input).
 *
 *   - parser: recursive descent, returns `Any?` (null) | Boolean | String |
 *     Long | Double | List<Any?> | Map<String, Any?>. Numbers without a `.`
 *     or `eE` and within Long range come back as `Long`; everything else
 *     becomes `Double`. That matches what the JS / Swift / Go SDKs hand
 *     back to callers (a generic "value tree" for the `data` map on a
 *     `WebhookEvent`).
 *
 * Total ~200 LOC including comments. Tested via the public `WebhooksTest`
 * + indirectly through every `NotificationsClient` / `DevicesClient` test
 * that sends a request body and matches it against a fixture.
 */

package dev.nitroping.internal

internal object Json {
    // ── writer ──────────────────────────────────────────────────────────

    /**
     * Render a value tree to a compact JSON string. Mixed numeric types
     * are accepted (Int / Long / Double / Float / Number) and emitted in
     * their natural form; unknown types fall through `toString()`.
     */
    fun encode(value: Any?): String {
        val sb = StringBuilder()
        encodeTo(sb, value)
        return sb.toString()
    }

    private fun encodeTo(sb: StringBuilder, value: Any?) {
        when (value) {
            null -> sb.append("null")
            is Boolean -> sb.append(if (value) "true" else "false")
            is Int, is Long, is Short, is Byte -> sb.append(value.toString())
            is Double -> {
                // Reject NaN/Infinity (JSON has no native form) — match Jackson behaviour.
                require(value.isFinite()) { "Cannot encode non-finite Double: $value" }
                // Avoid trailing `.0` for whole numbers to keep wire bodies small.
                if (value == value.toLong().toDouble() && value in MIN_SAFE_LONG..MAX_SAFE_LONG) {
                    sb.append(value.toLong().toString())
                } else {
                    sb.append(value.toString())
                }
            }
            is Float -> encodeTo(sb, value.toDouble())
            is Number -> sb.append(value.toString())
            is CharSequence -> encodeString(sb, value)
            is Map<*, *> -> {
                sb.append('{')
                var first = true
                for ((k, v) in value) {
                    if (!first) sb.append(',')
                    first = false
                    encodeString(sb, k?.toString() ?: "null")
                    sb.append(':')
                    encodeTo(sb, v)
                }
                sb.append('}')
            }
            is Iterable<*> -> {
                sb.append('[')
                var first = true
                for (item in value) {
                    if (!first) sb.append(',')
                    first = false
                    encodeTo(sb, item)
                }
                sb.append(']')
            }
            else -> encodeString(sb, value.toString())
        }
    }

    private fun encodeString(sb: StringBuilder, value: CharSequence) {
        sb.append('"')
        var i = 0
        while (i < value.length) {
            val c = value[i]
            when {
                c == '"' -> sb.append("\\\"")
                c == '\\' -> sb.append("\\\\")
                c == '\b' -> sb.append("\\b")
                c == '\u000C' -> sb.append("\\f")
                c == '\n' -> sb.append("\\n")
                c == '\r' -> sb.append("\\r")
                c == '\t' -> sb.append("\\t")
                c.code < 0x20 -> {
                    sb.append("\\u")
                    val hex = c.code.toString(16)
                    for (j in 0 until 4 - hex.length) sb.append('0')
                    sb.append(hex)
                }
                else -> sb.append(c)
            }
            i++
        }
        sb.append('"')
    }

    // ── parser ──────────────────────────────────────────────────────────

    /** Parse a JSON document into a value tree. Throws [IllegalArgumentException] on malformed input. */
    fun decode(text: String): Any? {
        val p = Parser(text)
        p.skipWhitespace()
        val out = p.readValue()
        p.skipWhitespace()
        require(p.pos == text.length) { "Trailing data at offset ${p.pos}" }
        return out
    }

    private class Parser(private val src: String) {
        var pos = 0

        fun skipWhitespace() {
            while (pos < src.length) {
                val c = src[pos]
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') pos++
                else break
            }
        }

        fun readValue(): Any? {
            skipWhitespace()
            require(pos < src.length) { "Unexpected end of input" }
            return when (val c = src[pos]) {
                '{' -> readObject()
                '[' -> readArray()
                '"' -> readString()
                't', 'f' -> readBoolean()
                'n' -> readNull()
                else -> if (c == '-' || c in '0'..'9') readNumber()
                else throw IllegalArgumentException("Unexpected character '$c' at offset $pos")
            }
        }

        private fun readObject(): Map<String, Any?> {
            pos++ // consume '{'
            val out = LinkedHashMap<String, Any?>()
            skipWhitespace()
            if (pos < src.length && src[pos] == '}') { pos++; return out }
            while (true) {
                skipWhitespace()
                require(pos < src.length && src[pos] == '"') { "Expected string key at offset $pos" }
                val key = readString()
                skipWhitespace()
                require(pos < src.length && src[pos] == ':') { "Expected ':' at offset $pos" }
                pos++
                val v = readValue()
                out[key] = v
                skipWhitespace()
                require(pos < src.length) { "Unterminated object" }
                when (src[pos]) {
                    ',' -> { pos++; continue }
                    '}' -> { pos++; return out }
                    else -> throw IllegalArgumentException("Expected ',' or '}' at offset $pos")
                }
            }
        }

        private fun readArray(): List<Any?> {
            pos++ // consume '['
            val out = ArrayList<Any?>()
            skipWhitespace()
            if (pos < src.length && src[pos] == ']') { pos++; return out }
            while (true) {
                out.add(readValue())
                skipWhitespace()
                require(pos < src.length) { "Unterminated array" }
                when (src[pos]) {
                    ',' -> { pos++; continue }
                    ']' -> { pos++; return out }
                    else -> throw IllegalArgumentException("Expected ',' or ']' at offset $pos")
                }
            }
        }

        private fun readString(): String {
            require(src[pos] == '"') { "Expected '\"' at offset $pos" }
            pos++
            val sb = StringBuilder()
            while (pos < src.length) {
                val c = src[pos]
                if (c == '"') { pos++; return sb.toString() }
                if (c == '\\') {
                    pos++
                    require(pos < src.length) { "Unterminated escape at offset $pos" }
                    val esc = src[pos]
                    when (esc) {
                        '"' -> sb.append('"')
                        '\\' -> sb.append('\\')
                        '/' -> sb.append('/')
                        'b' -> sb.append('\b')
                        'f' -> sb.append('\u000C')
                        'n' -> sb.append('\n')
                        'r' -> sb.append('\r')
                        't' -> sb.append('\t')
                        'u' -> {
                            require(pos + 4 < src.length) { "Truncated \\u escape" }
                            val hex = src.substring(pos + 1, pos + 5)
                            sb.append(hex.toInt(16).toChar())
                            pos += 4
                        }
                        else -> throw IllegalArgumentException("Invalid escape \\$esc at offset $pos")
                    }
                    pos++
                } else {
                    sb.append(c)
                    pos++
                }
            }
            throw IllegalArgumentException("Unterminated string starting at offset ${pos - sb.length - 1}")
        }

        private fun readBoolean(): Boolean {
            return if (src.startsWith("true", pos)) {
                pos += 4
                true
            } else if (src.startsWith("false", pos)) {
                pos += 5
                false
            } else throw IllegalArgumentException("Invalid literal at offset $pos")
        }

        private fun readNull(): Any? {
            require(src.startsWith("null", pos)) { "Invalid literal at offset $pos" }
            pos += 4
            return null
        }

        private fun readNumber(): Number {
            val start = pos
            if (src[pos] == '-') pos++
            while (pos < src.length && src[pos] in '0'..'9') pos++
            var isFloat = false
            if (pos < src.length && src[pos] == '.') {
                isFloat = true
                pos++
                while (pos < src.length && src[pos] in '0'..'9') pos++
            }
            if (pos < src.length && (src[pos] == 'e' || src[pos] == 'E')) {
                isFloat = true
                pos++
                if (pos < src.length && (src[pos] == '+' || src[pos] == '-')) pos++
                while (pos < src.length && src[pos] in '0'..'9') pos++
            }
            val text = src.substring(start, pos)
            return if (isFloat) text.toDouble() else text.toLongOrNull() ?: text.toDouble()
        }
    }

    private const val MAX_SAFE_LONG: Double = 9_007_199_254_740_992.0
    private const val MIN_SAFE_LONG: Double = -9_007_199_254_740_992.0
}
