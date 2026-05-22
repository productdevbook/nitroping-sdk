/*
 * NitropingClient.kt
 *
 * Top-level entry point for the Nitroping Kotlin SDK.
 *
 * Construct one and call into the sub-clients (`notifications`,
 * `devices`, `events`):
 *
 *   val client = NitropingClient(apiKey = "np_...")
 *
 *   val result = client.notifications.send(SendRequest(
 *       title = "Order #4129 shipped",
 *       body = "On its way",
 *       target = Target.All,
 *       idempotencyKey = "order-shipped-4129",
 *   ))
 *
 *   client.devices.register(DeviceRequest(
 *       platform = Platform.ANDROID,
 *       token = fcmToken,
 *       userId = "user-42",
 *   ))
 *
 * The instance is safe to share across coroutines and threads — the
 * underlying `java.net.http.HttpClient` is thread-safe, and the SDK
 * itself holds only immutable state.
 */

package dev.nitroping

import dev.nitroping.internal.HttpTransport
import java.net.http.HttpClient

public class NitropingClient(
    /**
     * Secret API key (`np_...`). Falls back to the `NITROPING_API_KEY`
     * environment variable when null.
     */
    apiKey: String? = null,
    /** Base URL — override for staging or a self-hosted deployment. */
    baseUrl: String = DEFAULT_BASE_URL,
    /** Per-request timeout in milliseconds. Default 30s. */
    timeoutMs: Long = 30_000L,
    /** Optional custom `User-Agent`. */
    userAgent: String = "nitroping-kotlin/${HttpTransport.SDK_VERSION}",
    /** Inject your own `java.net.http.HttpClient` for tests / proxy / mTLS. */
    httpClient: HttpClient? = null,
) {
    private val resolvedApiKey: String = (apiKey ?: System.getenv("NITROPING_API_KEY") ?: "")
        .also {
            if (it.isEmpty()) throw NitropingException(
                "apiKey is required. Pass it to NitropingClient(apiKey = ...) or set the NITROPING_API_KEY environment variable.",
                code = "invalid_argument",
            )
        }

    private val transport: HttpTransport = if (httpClient != null) {
        HttpTransport(
            baseUrl = baseUrl,
            apiKey = resolvedApiKey,
            userAgent = userAgent,
            timeoutMs = timeoutMs,
            client = httpClient,
        )
    } else {
        HttpTransport(
            baseUrl = baseUrl,
            apiKey = resolvedApiKey,
            userAgent = userAgent,
            timeoutMs = timeoutMs,
        )
    }

    /** `notifications` resource — `send`, `get`. */
    public val notifications: Notifications = Notifications(transport)

    /** `devices` resource — `register`, `deactivate`. */
    public val devices: Devices = Devices(transport)

    /** `events` resource — `report` (open / click). */
    public val events: Events = Events(transport)

    public companion object {
        /** Default base URL pointing at the hosted nitroping service. */
        public const val DEFAULT_BASE_URL: String = "https://nitroping.dev"
    }
}
