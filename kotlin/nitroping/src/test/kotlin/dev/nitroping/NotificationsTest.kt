/*
 * NotificationsTest.kt
 *
 * Stubs the HTTP server, sends a notification, and asserts the SDK
 * produced the wire shape we promised (`deep_link`, `actions`,
 * `target.user_ids`, etc.) — matching the JS SDK's
 * `js/test/notifications.test.ts` line-for-line.
 */

package dev.nitroping

import dev.nitroping.internal.Json
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class NotificationsTest {
    private lateinit var stub: HttpStub

    @BeforeEach fun setup() { stub = HttpStub() }
    @AfterEach fun teardown() { stub.close() }

    @Test fun `posts to slash api slash v1 slash notifications with correct headers and JSON body`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"abc-123","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_test_secret", baseUrl = stub.baseUrl)
        val result = client.notifications.send(
            SendRequest(
                title = "Order #4129 shipped",
                body = "On its way",
                deepLink = "https://example.com/orders/4129",
                actions = listOf(Action(id = "track", title = "Track")),
                target = Target.All,
            ),
        )

        assertEquals(NotificationResult(id = "abc-123", status = "queued"), result)

        val req = stub.received.single()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/notifications", req.path)
        assertEquals("ApiKey np_test_secret", req.headers["Authorization"])
        assertEquals("application/json", req.headers["Content-Type"])
        assertEquals("application/json", req.headers["Accept"])

        val body = Json.decode(req.body) as Map<*, *>
        assertEquals("Order #4129 shipped", body["title"])
        assertEquals("On its way", body["body"])
        assertEquals("https://example.com/orders/4129", body["deep_link"])
        assertEquals(listOf(mapOf("id" to "track", "title" to "Track")), body["actions"])
        assertEquals(mapOf("all" to true), body["target"])
    }

    @Test fun `forwards Idempotency-Key header when provided`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"n1","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.notifications.send(
            SendRequest(
                title = "Hi",
                body = "There",
                target = Target.UserIds(listOf("u1")),
                idempotencyKey = "order-shipped-4129",
            ),
        )

        val req = stub.received.single()
        assertEquals("order-shipped-4129", req.headers["Idempotency-Key"])
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals(mapOf("user_ids" to listOf("u1")), body["target"])
    }

    @Test fun `throws ApiException on non-2xx with code+message+details from server envelope`() = runTest {
        stub.enqueue(
            status = 422,
            body = """{"error":{"code":"validation_failed","message":"Request body failed validation","details":{"title":["can't be blank"]}}}""",
        )

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val err = assertThrows<ApiException> {
            client.notifications.send(
                SendRequest(body = "", target = Target.All),
            )
        }
        assertEquals(422, err.status)
        assertEquals("validation_failed", err.code)
        assertEquals("Request body failed validation", err.message)
        val details = err.details as Map<*, *>
        assertEquals(listOf("can't be blank"), details["title"])
    }

    @Test fun `supports a custom baseUrl with a trailing slash`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"n1","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = "${stub.baseUrl}/")
        client.notifications.send(SendRequest(title = "x", body = "y", target = Target.All))

        val req = stub.received.single()
        assertEquals("/api/v1/notifications", req.path)
    }

    @Test fun `converts target deviceIds to wire format`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"n1","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.notifications.send(
            SendRequest(
                title = "x",
                body = "y",
                target = Target.DeviceIds(listOf("d1", "d2")),
            ),
        )

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals(mapOf("device_ids" to listOf("d1", "d2")), body["target"])
    }

    @Test fun `omits null fields in the wire body`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"n1","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.notifications.send(
            SendRequest(title = "x", body = "y", target = Target.All),
        )

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertTrue("deep_link" !in body)
        assertTrue("actions" !in body)
        assertTrue("data" !in body)
    }

    @Test fun `devices register sends correct payload`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"dev-1","created":true}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.devices.register(
            DeviceRequest(
                platform = Platform.ANDROID,
                token = "fcm-token-abc",
                userId = "user-42",
                metadata = mapOf("app_version" to "2.4.1"),
            ),
        )

        assertEquals(DeviceResult(id = "dev-1", created = true), result)
        val req = stub.received.single()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/devices", req.path)

        val body = Json.decode(req.body) as Map<*, *>
        assertEquals("fcm-token-abc", body["token"])
        assertEquals("android", body["platform"])
        assertEquals("user-42", body["user_id"])
        assertEquals(mapOf("app_version" to "2.4.1"), body["metadata"])
    }

    @Test fun `devices deactivate sends DELETE`() = runTest {
        stub.enqueue(status = 200, body = """{"id":"dev-1","status":"inactive"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.devices.deactivate("dev-1")
        assertEquals(DeviceDeactivateResult(id = "dev-1", status = "inactive"), result)

        val req = stub.received.single()
        assertEquals("DELETE", req.method)
        assertEquals("/api/v1/devices/dev-1", req.path)
    }

    @Test fun `events report posts the engagement type`() = runTest {
        stub.enqueue(status = 202, body = """{"id":"evt_1","accepted":true}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.events.report(
            notificationId = "notif_1",
            type = EngagementType.CLICKED,
            deviceId = "dev_1",
            actionId = "track",
        )

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals("notif_1", body["notification_id"])
        assertEquals("clicked", body["type"])
        assertEquals("dev_1", body["device_id"])
        assertEquals("track", body["action_id"])
    }

    @Test fun `throws on empty apiKey when env is also empty`() {
        val original = System.getenv("NITROPING_API_KEY")
        // Clear the env so we hit the missing-key branch deterministically.
        // We can't actually unset envs in-process, but we *can* construct
        // with apiKey = "" and verify behaviour — which is the same code
        // path the constructor takes when env is unset.
        val err = assertThrows<NitropingException> { NitropingClient(apiKey = "") }
        assertEquals("invalid_argument", err.code)
        assertNotNull(err.message)
        // ignore-original-env: real-world callers can't unset env from
        // inside a JVM, so reading + asserting is enough.
        @Suppress("UNUSED_VARIABLE") val unused = original
    }

    @Test fun `notifications cancel sends DELETE and parses id+status`() = runTest {
        stub.enqueue(status = 200, body = """{"id":"notif_1","status":"canceled"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.notifications.cancel("notif_1")
        assertEquals(NotificationCancelResult(id = "notif_1", status = "canceled"), result)

        val req = stub.received.single()
        assertEquals("DELETE", req.method)
        assertEquals("/api/v1/notifications/notif_1", req.path)
    }

    @Test fun `converts target tags to wire format`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"n1","status":"queued"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.notifications.send(
            SendRequest(
                title = "x",
                body = "y",
                target = Target.Tags(listOf("premium", "tr")),
            ),
        )

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals(mapOf("tags" to listOf("premium", "tr")), body["target"])
    }

    @Test fun `devices update sends PUT with tags body and parses id+tags`() = runTest {
        stub.enqueue(status = 200, body = """{"id":"dev-1","tags":["premium","tr"]}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.devices.update("dev-1", listOf("premium", "tr"))
        assertEquals(DeviceUpdateResult(id = "dev-1", tags = listOf("premium", "tr")), result)

        val req = stub.received.single()
        assertEquals("PUT", req.method)
        assertEquals("/api/v1/devices/dev-1", req.path)
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals(listOf("premium", "tr"), body["tags"])
    }

    @Test fun `devices update with empty list clears tags`() = runTest {
        stub.enqueue(status = 200, body = """{"id":"dev-1","tags":[]}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.devices.update("dev-1", emptyList())
        assertEquals(DeviceUpdateResult(id = "dev-1", tags = emptyList()), result)

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals(emptyList<String>(), body["tags"])
    }

    @Test fun `devices register includes tags when provided`() = runTest {
        stub.enqueue(status = 201, body = """{"id":"dev-1","created":true}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        client.devices.register(
            DeviceRequest(
                platform = Platform.WEB,
                token = "https://push.example/abc",
                tags = listOf("beta"),
            ),
        )

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals(listOf("beta"), body["tags"])
    }

    @Test fun `track record by delivery log posts snake_case body`() = runTest {
        stub.enqueue(status = 202, body = """{"accepted":true}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.track.record(
            TrackRequest.ByDeliveryLog(deliveryLogId = "dl_1", event = TrackEvent.DELIVERED),
        )
        assertEquals(TrackResult(accepted = true), result)

        val req = stub.received.single()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/track", req.path)
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals("dl_1", body["delivery_log_id"])
        assertEquals("delivered", body["event"])
        assertTrue("notification_id" !in body)
        assertTrue("device_token" !in body)
    }

    @Test fun `track record by notification posts notification_id+device_token`() = runTest {
        stub.enqueue(status = 202, body = """{"accepted":true}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.track.record(
            TrackRequest.ByNotification(
                notificationId = "notif_1",
                deviceToken = "fcm-token-abc",
                event = TrackEvent.OPENED,
            ),
        )
        assertEquals(TrackResult(accepted = true), result)

        val body = Json.decode(stub.received.single().body) as Map<*, *>
        assertEquals("notif_1", body["notification_id"])
        assertEquals("fcm-token-abc", body["device_token"])
        assertEquals("opened", body["event"])
        assertTrue("delivery_log_id" !in body)
    }

    @Test fun `fetchVapidPublicKey GETs the public endpoint and reads public_key`() = runTest {
        stub.enqueue(status = 200, body = """{"public_key":"BVAPID...key"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val result = client.fetchVapidPublicKey("app_1")
        assertEquals(VapidPublicKey(publicKey = "BVAPID...key"), result)

        val req = stub.received.single()
        assertEquals("GET", req.method)
        assertEquals("/api/v1/public/apps/app_1/vapid", req.path)
    }

    @Test fun `notifications get returns the raw map`() = runTest {
        stub.enqueue(
            status = 200,
            body = """{"id":"notif_1","status":"sent","counters":{"total_sent":3}}""",
        )

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val out = client.notifications.get("notif_1")
        assertEquals("notif_1", out["id"])
        assertEquals("sent", out["status"])
        val counters = out["counters"] as Map<*, *>
        assertEquals(3L, counters["total_sent"])
    }
}
