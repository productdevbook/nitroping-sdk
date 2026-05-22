/*
 * HttpStub.kt
 *
 * Tiny HTTP stubbing harness for unit tests. Spins up a `java.net.HttpServer`
 * on an ephemeral port, lets each test wire up arbitrary request handlers,
 * and exposes a `record` API so tests can assert "the SDK sent the right
 * request" alongside "the SDK parsed the right response".
 *
 * This keeps tests fast (~1ms per request) and dependency-free — no Mockito,
 * no MockK, no OkHttp MockWebServer. We pay with ~80 LOC of harness and
 * gain a portable test that runs on every JVM.
 */

package dev.nitroping

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpHandler
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentLinkedQueue

internal class HttpStub : AutoCloseable {
    private val server: HttpServer = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    val baseUrl: String

    /** Every received request, in order. */
    val received: MutableList<RecordedRequest> = mutableListOf()
    private val handlers = ConcurrentLinkedQueue<(HttpExchange) -> StubResponse>()

    init {
        server.createContext("/", HttpHandler { exchange ->
            // HttpExchange normalizes header keys (e.g. `content-type` →
            // `Content-Type`). Wrap into a case-insensitive map so the
            // tests can assert with the camelCase the SDK sends.
            val rawHeaders = exchange.requestHeaders.toMap()
                .mapValues { it.value.joinToString(",") }
            val ciHeaders: Map<String, String> = object : Map<String, String> by rawHeaders {
                private val lookup = rawHeaders.mapKeys { it.key.lowercase() }
                override fun get(key: String): String? = lookup[key.lowercase()]
                override fun containsKey(key: String): Boolean = lookup.containsKey(key.lowercase())
            }
            val req = RecordedRequest(
                method = exchange.requestMethod,
                path = exchange.requestURI.path + (exchange.requestURI.rawQuery?.let { "?$it" } ?: ""),
                headers = ciHeaders,
                body = exchange.requestBody.readBytes().toString(Charsets.UTF_8),
            )
            synchronized(received) { received.add(req) }
            val handler = handlers.poll() ?: { _: HttpExchange -> StubResponse(500, "no handler queued") }
            val resp = handler(exchange)
            val bytes = resp.body.toByteArray(Charsets.UTF_8)
            for ((k, v) in resp.headers) exchange.responseHeaders.add(k, v)
            if (resp.headers.keys.none { it.equals("Content-Type", ignoreCase = true) }) {
                exchange.responseHeaders.add("Content-Type", "application/json")
            }
            exchange.sendResponseHeaders(resp.status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        })
        server.executor = null
        server.start()
        baseUrl = "http://127.0.0.1:${server.address.port}"
    }

    /** Queue the next response. Handlers fire FIFO. */
    fun enqueue(response: StubResponse) {
        handlers.add { response }
    }

    fun enqueue(
        status: Int = 200,
        body: String = "{}",
        headers: Map<String, String> = emptyMap(),
    ) {
        enqueue(StubResponse(status, body, headers))
    }

    override fun close() {
        server.stop(0)
    }
}

internal data class RecordedRequest(
    val method: String,
    val path: String,
    val headers: Map<String, String>,
    val body: String,
)

internal data class StubResponse(
    val status: Int,
    val body: String,
    val headers: Map<String, String> = emptyMap(),
)
