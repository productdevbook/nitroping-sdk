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
    /**
     * Opt-in debug callback. When non-null, receives one structured event
     * map per request and per response/error
     * (`{"phase":"request"|"response"|"error","method","url",...}`). The
     * `Authorization` header / API key is always redacted before the event
     * is emitted. Off by default — set it to route into your own logger,
     * Sentry breadcrumbs, etc.
     */
    debug: ((Map<String, Any?>) -> Unit)? = null,
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
            debug = debug,
        )
    } else {
        HttpTransport(
            baseUrl = baseUrl,
            apiKey = resolvedApiKey,
            userAgent = userAgent,
            timeoutMs = timeoutMs,
            debug = debug,
        )
    }

    /** `notifications` resource — `send`, `get`, `cancel`. */
    public val notifications: Notifications = Notifications(transport)

    /** `devices` resource — `register`, `update`, `deactivate`. */
    public val devices: Devices = Devices(transport)

    /** `events` resource — `report` (open / click). */
    public val events: Events = Events(transport)

    /** `track` resource — `record` (delivered / opened / clicked callback). */
    public val track: Track = Track(transport)

    /** `inbox` resource — `list`, `unreadCount`, `markRead`, `markAllRead`. */
    public val inbox: InboxClient = InboxClient(transport)

    /**
     * Fetch an app's VAPID public key for Web Push.
     *
     * Wraps `GET /api/v1/public/apps/:id/vapid`. The key is public by
     * definition (it ships in the JWT on every push), so the endpoint needs
     * no auth — though the SDK still sends its `Authorization` header, which
     * the server ignores here.
     *
     * Returns [VapidPublicKey]. Throws [ApiException] with
     * `code = "vapid_not_configured"` (404) when the app has no VAPID
     * bundle linked, or `code = "not_found"` (404) when the app id is
     * unknown.
     */
    public suspend fun fetchVapidPublicKey(appId: String): VapidPublicKey {
        require(appId.isNotEmpty()) { "appId must not be empty" }
        val raw = transport.request("GET", "/api/v1/public/apps/$appId/vapid")
        val map = raw as? Map<*, *>
            ?: throw NitropingException("Unexpected response shape", code = "decode_error")
        return VapidPublicKey(
            publicKey = map["public_key"] as? String
                ?: throw NitropingException("Missing `public_key` in response", code = "decode_error"),
        )
    }

    public companion object {
        /** Default base URL pointing at the hosted nitroping service. */
        public const val DEFAULT_BASE_URL: String = "https://nitroping.dev"
    }
}
