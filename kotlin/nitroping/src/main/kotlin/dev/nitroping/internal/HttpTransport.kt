/*
 * HttpTransport.kt
 *
 * Internal HTTP wrapper around `java.net.http.HttpClient` (JDK 11+, ships
 * with every modern JVM and with Android API 21+ via desugaring + AGP).
 *
 * Same shape as `js/src/http.ts`:
 *
 *   - injects `Authorization: ApiKey ...` + `Accept: application/json`
 *   - JSON-encodes the body via our internal [dev.nitroping.internal.Json]
 *     writer
 *   - parses the response as JSON; on non-2xx unwraps the
 *     `{error:{code,message,details}}` envelope into [ApiException]
 *   - any underlying IOException becomes a [NetworkException]
 *
 * `request<T>(...)` is a `suspend` function. Under the hood we use
 * `HttpClient.sendAsync(...)` + `await()` so the calling coroutine stays
 * properly suspended and cancellation works (a cancelled coroutine cancels
 * the underlying `CompletableFuture`, which closes the connection).
 */

package dev.nitroping.internal

import dev.nitroping.ApiException
import dev.nitroping.NetworkException
import dev.nitroping.NitropingException
import kotlinx.coroutines.future.await
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.CancellationException
import java.util.concurrent.CompletionException

internal class HttpTransport(
    val baseUrl: String,
    private val apiKey: String,
    internal val authScheme: String = if (apiKey.startsWith("pk_")) "Public" else "ApiKey",
    private val userAgent: String = "nitroping-kotlin/$SDK_VERSION",
    private val timeoutMs: Long = 30_000L,
    /** Inject your own client for tests; default lazily builds one. */
    private val client: HttpClient = defaultClient(timeoutMs),
) {
    /**
     * Send a request and decode the response.
     *
     * @param method HTTP verb (`"GET"`, `"POST"`, `"PUT"`, `"DELETE"`).
     *               `java.net.http.HttpRequest.Builder.method(...)` accepts
     *               any of these; only `CONNECT` is rejected by the JDK
     *               client, so `PUT` for the device-update endpoint works
     *               without a dedicated code path.
     * @param path path component starting with `/`; appended to [baseUrl].
     * @param body optional value tree (`Map<String, Any?>`); JSON-encoded
     *             via [Json.encode] when non-null.
     * @param headers extra request headers; merged with the defaults
     *                (later entries win).
     * @return the parsed JSON tree (`Map<String, Any?>` for object
     *         responses, `List<*>` for arrays, etc.). Empty body returns
     *         `null`.
     */
    suspend fun request(
        method: String,
        path: String,
        body: Any? = null,
        headers: Map<String, String> = emptyMap(),
    ): Any? {
        val url = buildUrl(path)
        val builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofMillis(timeoutMs))
            .header("Authorization", "$authScheme $apiKey")
            .header("Accept", "application/json")
            .header("User-Agent", userAgent)

        if (body != null) {
            val payload = Json.encode(body)
            builder.header("Content-Type", "application/json")
            builder.method(method, HttpRequest.BodyPublishers.ofString(payload, Charsets.UTF_8))
        } else {
            // No body but still need to set the method (HttpRequest.Builder
            // defaults to GET).
            builder.method(method, HttpRequest.BodyPublishers.noBody())
        }

        for ((k, v) in headers) builder.header(k, v)

        val response: HttpResponse<String> = try {
            client.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofString(Charsets.UTF_8))
                .await()
        } catch (ce: CancellationException) {
            throw ce
        } catch (ce: CompletionException) {
            val cause = ce.cause ?: ce
            if (cause is NitropingException) throw cause
            throw NetworkException("Request to $url failed: ${cause.message}", cause)
        } catch (e: Throwable) {
            if (e is NitropingException) throw e
            throw NetworkException("Request to $url failed: ${e.message}", e)
        }

        return parseResponse(response)
    }

    private fun parseResponse(response: HttpResponse<String>): Any? {
        val text = response.body() ?: ""
        val parsed: Any? = if (text.isEmpty()) null else try {
            Json.decode(text)
        } catch (e: Throwable) {
            // Non-JSON body — pass through as a NitropingException on non-2xx;
            // on success let it through as a raw string (the only endpoint
            // that's plain text is health, which we don't expose).
            if (response.statusCode() !in 200..299) {
                throw ApiException(
                    "HTTP ${response.statusCode()}: ${text.take(200)}",
                    status = response.statusCode(),
                    code = "http_${response.statusCode()}",
                )
            }
            text
        }

        if (response.statusCode() !in 200..299) {
            val envelope = (parsed as? Map<*, *>)?.get("error") as? Map<*, *>
            val code = envelope?.get("code") as? String ?: "http_${response.statusCode()}"
            val message = envelope?.get("message") as? String ?: "HTTP ${response.statusCode()}"
            val details = envelope?.get("details")
            throw ApiException(message, status = response.statusCode(), code = code, details = details)
        }

        return parsed
    }

    private fun buildUrl(path: String): String {
        val normalized = if (path.startsWith("/")) path else "/$path"
        val trimmedBase = baseUrl.trimEnd('/')
        return "$trimmedBase$normalized"
    }

    internal companion object {
        const val SDK_VERSION: String = "0.2.3"

        private fun defaultClient(timeoutMs: Long): HttpClient =
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMs))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build()
    }
}
