> This package is part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo.
> See the [top-level README](../README.md) for SDKs in other languages.

<p align="center">
  <br>
  <b style="font-size: 2em;">nitroping-kotlin</b>
  <br><br>
  Zero-dependency Kotlin SDK for <a href="https://nitroping.dev">nitroping</a>.
  <br>
  Send push notifications, register devices, verify webhooks. Pure JVM core
  for Ktor / Spring / your favorite backend, plus an Android sugar module
  for FCM payload parsing.
  <br><br>
  <a href="https://central.sonatype.com/artifact/dev.nitroping/nitroping"><img src="https://img.shields.io/maven-central/v/dev.nitroping/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="Maven Central"></a>
  <a href="https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/nitroping-sdk?style=flat&colorA=18181B&colorB=34d399" alt="license"></a>
  <a href="https://github.com/productdevbook/nitroping-sdk/stargazers"><img src="https://img.shields.io/github/stars/productdevbook/nitroping-sdk?style=flat&colorA=18181B&colorB=34d399" alt="GitHub stars"></a>
</p>

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your
app with one HTTP call. The service handles fanout, retries, idempotency,
quota, and outbound webhooks for delivery state — you write the product,
not the plumbing.

`nitroping-kotlin` is the official Kotlin client. The core module has
**zero runtime dependencies** beyond `kotlinx-coroutines-core` (de-facto
stdlib for modern Kotlin) and uses only JDK 11+ APIs
(`java.net.http.HttpClient`, `javax.crypto.Mac`). The Android module
adds FCM payload parsing helpers on top, with no other transitive deps
beyond `androidx.core`.

## Install

Two artifacts. Pick the right one for your project (or both if you run a
Kotlin backend that *sends* pushes and an Android app that *receives* them).

### Core — Kotlin/JVM (Ktor, Spring, any backend, also Android)

```kotlin
// build.gradle.kts
dependencies {
    implementation("dev.nitroping:nitroping:0.1.0")
}
```

### Android sugar — adds the FCM RemoteMessage helper

```kotlin
// build.gradle.kts (Android app module)
dependencies {
    implementation("dev.nitroping:nitroping-android:0.1.0")
    // ^ transitively brings in dev.nitroping:nitroping
}
```

> **Min Android SDK is 24.** The HTTP layer uses `java.net.http.HttpClient`,
> which AGP can desugar onto API 21+, but we set 24 as the floor to keep
> coroutines + desugaring overhead reasonable.

## Quick Start

### Send a notification (server)

```kotlin
import dev.nitroping.NitropingClient
import dev.nitroping.SendRequest
import dev.nitroping.Action
import dev.nitroping.Target

val client = NitropingClient(apiKey = System.getenv("NITROPING_API_KEY"))

val result = client.notifications.send(SendRequest(
    title = "Order #4129 shipped",
    body = "On its way",
    deepLink = "https://example.com/orders/4129",
    actions = listOf(Action(id = "track", title = "Track")),
    target = Target.UserIds(listOf("user-42")),
    idempotencyKey = "order-shipped-4129",
))

println("${result.id} ${result.status}") // "abc-...", "queued"
```

All HTTP calls are `suspend` functions — wrap them in
`runBlocking { ... }` from a CLI / test, or call them directly from any
coroutine scope (`CoroutineScope.launch { ... }`, Ktor route handlers,
Spring WebFlux, etc.).

### Register an Android device (Android app)

```kotlin
import dev.nitroping.NitropingClient
import dev.nitroping.DeviceRequest
import dev.nitroping.Platform
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

suspend fun registerWithNitroping(userId: String?) {
    val fcmToken = FirebaseMessaging.getInstance().token.await()
    val client = NitropingClient(apiKey = BuildConfig.NITROPING_PUBLIC_KEY)
    client.devices.register(DeviceRequest(
        platform = Platform.ANDROID,
        token = fcmToken,
        userId = userId,
    ))
}
```

### Handle incoming notifications (Android)

```kotlin
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.nitroping.android.NitropingPayload

class NitropingMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remote: RemoteMessage) {
        val payload = NitropingPayload(remote.data)

        payload.deepLink?.let { url ->
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
        }

        // payload.actions, payload.notificationId, payload.deviceId,
        // payload.data are all available too.
    }
}
```

### Verify a webhook (server)

```kotlin
import dev.nitroping.webhooks.verifyWebhook

val event = verifyWebhook(
    body = rawBody,                                       // ByteArray or String
    signature = headers["X-Nitroping-Signature"],
    secret = System.getenv("NITROPING_WEBHOOK_SECRET"),
    tolerance = 300,                                      // seconds
)

when (event.type) {
    "notification.delivered" -> println("delivered ${event.data["notification_id"]}")
    "notification.failed"    -> /* log + alert */ Unit
    "notification.opened"    -> /* update analytics */ Unit
    "notification.clicked"   -> /* record action_id */ Unit
}
```

Throws `MissingSignatureHeaderException`, `InvalidSignatureException`,
`TimestampOutOfRangeException`, or `NitropingException` with code
`invalid_body` on malformed JSON.

## API reference

### `NitropingClient(...)`

Creates a server-side client.

```kotlin
val client = NitropingClient(
    apiKey = "np_live_...",                  // or null + set NITROPING_API_KEY
    baseUrl = "https://nitroping.dev",       // optional, default shown
    timeoutMs = 30_000,                      // optional, default 30s
)
```

Inject your own `java.net.http.HttpClient` if you need a proxy / mTLS:

```kotlin
val custom = HttpClient.newBuilder().proxy(...).build()
val client = NitropingClient(apiKey = "np_...", httpClient = custom)
```

#### `client.notifications.send(input)`

Sends a notification. Returns `NotificationResult(id, status)`. Throws
`ApiException` on non-2xx, carrying the server's `code`, `message`, and
per-field `details`.

```kotlin
client.notifications.send(SendRequest(
    title = "Welcome!",
    body = "Glad to have you on board.",
    icon = "https://example.com/icon.png",
    image = "https://example.com/hero.png",
    deepLink = "https://example.com/welcome",
    data = mapOf("onboarding" to true),
    actions = listOf(Action(id = "tour", title = "Take the tour")),
    target = Target.All,
    idempotencyKey = "welcome-user-42",
))
```

`target` is a sealed class — exactly one of:

| Selector                              | Use when                         |
| ------------------------------------- | -------------------------------- |
| `Target.All`                          | Broadcast to every active device |
| `Target.DeviceIds(listOf("..."))`     | Hit specific device rows         |
| `Target.UserIds(listOf("..."))`       | Hit every device a user owns     |

`idempotencyKey` maps to the `Idempotency-Key` header. Same key + same body
replays the original response; same key + different body returns a 409 with
`code = "idempotency_conflict"`.

#### `client.notifications.get(id)`

Fetch a previously-enqueued notification by id. Returns a
`Map<String, Any?>` — the full row including counters.

```kotlin
val n = client.notifications.get("abc-123")
val counters = n["counters"] as Map<*, *>
println(counters["total_sent"])
```

#### `client.devices.register(input)`

Register a device. Idempotent on `(token, userId)`. Returns
`DeviceResult(id, created)` where `created` is `false` on idempotent replay.

```kotlin
client.devices.register(DeviceRequest(
    platform = Platform.ANDROID,
    token = fcmToken,
    userId = "user-42",
    metadata = mapOf("app_version" to "2.4.1"),
))
```

#### `client.devices.deactivate(id)`

Soft-deletes the device row (`status = "inactive"`). Subsequent sends skip it.

#### `client.events.report(notificationId, type, ...)`

Reports an engagement event (open / click) back to nitroping. Returns
`Unit` — there's nothing meaningful in the 202 response.

```kotlin
client.events.report(
    notificationId = payload.notificationId!!,
    type = EngagementType.CLICKED,
    deviceId = payload.deviceId,
    actionId = "track",
)
```

### `verifyWebhook(body, signature, secret, ...)`

Verifies the `X-Nitroping-Signature` header and returns the parsed
`WebhookEvent`.

The signing scheme is HMAC-SHA256 over `"<unix>.<raw body>"`. The header
ships as `t=<unix>, v1=<hex>` — same as Polar / Stripe. Pass the **raw
request body** (bytes or the original string) — not a re-serialized parsed
object — or the HMAC won't match.

### `NitropingPayload(data)` — `nitroping-android`

Parses an FCM `RemoteMessage.data` map.

```kotlin
val payload = NitropingPayload(remote.data)
payload.deepLink         // String?
payload.actions          // List<Action>
payload.notificationId   // String?
payload.deviceId         // String?
payload.platform         // String?  ("android")
payload.data             // Map<String, String> (without reserved keys)
payload.isNitropingPayload  // Boolean
```

## Framework recipes

### Ktor server — send + verify

```kotlin
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import dev.nitroping.NitropingClient
import dev.nitroping.SendRequest
import dev.nitroping.Target
import dev.nitroping.webhooks.verifyWebhook

fun Application.nitropingRoutes() {
    val client = NitropingClient(apiKey = System.getenv("NITROPING_API_KEY"))
    val webhookSecret = System.getenv("NITROPING_WEBHOOK_SECRET")

    routing {
        post("/send") {
            val title = call.request.queryParameters["title"] ?: "Hello"
            val r = client.notifications.send(SendRequest(
                title = title,
                body = "From Ktor",
                target = Target.All,
            ))
            call.respond(mapOf("id" to r.id, "status" to r.status))
        }

        post("/webhooks/nitroping") {
            val bytes = call.receive<ByteArray>()
            try {
                val event = verifyWebhook(
                    body = bytes,
                    signature = call.request.header("X-Nitroping-Signature"),
                    secret = webhookSecret,
                )
                // ...handle event...
                call.respondText("ok")
            } catch (e: Exception) {
                call.respondText("signature error", status = io.ktor.http.HttpStatusCode.BadRequest)
            }
        }
    }
}
```

### Spring Boot — webhook handler

```kotlin
@RestController
class NitropingWebhookController(
    @Value("\${nitroping.webhook.secret}") private val secret: String,
) {
    @PostMapping("/webhooks/nitroping")
    fun handle(
        @RequestHeader("X-Nitroping-Signature") signature: String?,
        @RequestBody body: ByteArray,
    ): ResponseEntity<String> = try {
        val event = verifyWebhook(body, signature, secret)
        // ...handle event...
        ResponseEntity.ok("received ${event.id}")
    } catch (_: NitropingException) {
        ResponseEntity.badRequest().body("bad signature")
    }
}
```

### Android FirebaseMessagingService

```kotlin
class NitropingMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remote: RemoteMessage) {
        val payload = NitropingPayload(remote.data)

        // Report opens / clicks back to nitroping for analytics.
        payload.notificationId?.let { notifId ->
            CoroutineScope(Dispatchers.IO).launch {
                NitropingClient(BuildConfig.NITROPING_API_KEY)
                    .events
                    .report(
                        notificationId = notifId,
                        type = EngagementType.OPENED,
                        deviceId = payload.deviceId,
                    )
            }
        }

        // Open the deep link in the app.
        payload.deepLink?.let { url ->
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
        }
    }

    override fun onNewToken(token: String) {
        // Push the rotated token to nitroping so future sends route here.
        CoroutineScope(Dispatchers.IO).launch {
            NitropingClient(BuildConfig.NITROPING_API_KEY)
                .devices
                .register(DeviceRequest(
                    platform = Platform.ANDROID,
                    token = token,
                ))
        }
    }
}
```

## Errors

Every error thrown by the SDK extends `NitropingException`. Narrow with
`is` to handle specific cases:

| Class                              | When it fires                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `NitropingException`               | Base class. Any internal failure with no more specific subclass.                             |
| `NetworkException`                 | The underlying `HttpClient` failed (DNS, TLS, offline, abort). Original cause via `cause`.   |
| `ApiException`                     | Server returned a non-2xx. Carries `status`, `code`, server `message`, optional `details`.   |
| `InvalidSignatureException`        | `verifyWebhook` HMAC mismatch or malformed header.                                           |
| `TimestampOutOfRangeException`     | `verifyWebhook` signature valid but `t=` outside the tolerance window.                       |
| `MissingSignatureHeaderException`  | `verifyWebhook` with no `X-Nitroping-Signature` header.                                      |

```kotlin
try {
    client.notifications.send(SendRequest(title = "Hi", body = "There", target = Target.All))
} catch (e: NetworkException) {
    // transient — retry with backoff
} catch (e: ApiException) {
    if (e.code == "quota_exceeded") {
        // surface "upgrade your plan" UI; e.details has the quota envelope
    } else throw e
}
```

## Coroutines

All HTTP methods on `NitropingClient` are `suspend`. The underlying HTTP
layer uses `HttpClient.sendAsync(...).await()` (kotlinx-coroutines-jdk8's
`await()` extension on `CompletableFuture`), so cancelling the calling
coroutine cancels the in-flight request — important for Android, where
the app may go to background mid-call.

The webhook verifier (`verifyWebhook`) is a **plain function**, not a
suspend function — it's pure CPU (HMAC + JSON parse) and finishes in
microseconds. Call it from a coroutine or a synchronous handler; either
works.

## Runtime support

| Runtime              | Status                                       |
| -------------------- | -------------------------------------------- |
| JDK 17+ (Linux/Mac/Windows) | Yes                                   |
| Android 7.0+ (API 24+)      | Yes (via `nitroping-android`)         |
| Kotlin/JS, Kotlin/Native   | Not yet. Open an issue if you need it. |

## License

[MIT](../LICENSE) — Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
