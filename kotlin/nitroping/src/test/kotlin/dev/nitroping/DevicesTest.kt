/*
 * DevicesTest.kt
 *
 * Stubs the HTTP server and exercises the device-list (`GET /api/v1/devices`)
 * and deactivate-by-token (`DELETE /api/v1/devices` with a `{ token }` body)
 * paths — asserting the SDK sends the right requests, maps snake_case wire
 * into [DeviceSummary], never surfaces the push token, and unwraps the
 * `not_found` error envelope. Mirrors `js/test/devices.test.ts`.
 */

package dev.nitroping

import dev.nitroping.internal.Json
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DevicesTest {
    private lateinit var stub: HttpStub

    @BeforeEach fun setup() { stub = HttpStub() }
    @AfterEach fun teardown() { stub.close() }

    @Test fun `list GETs the devices endpoint with snake_case query and maps rows`() = runTest {
        stub.enqueue(
            status = 200,
            body = """
                {"data":[{"id":"dev-1","user_id":"alice","platform":"ios","status":"active",
                "tags":["vip"],"timezone":"Europe/Istanbul","apns_environment":"production",
                "last_seen_at":"2026-06-15T00:00:00Z","inserted_at":"2026-06-14T00:00:00Z"}],"total":1}
            """.trimIndent().replace("\n", ""),
        )

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val res = client.devices.list(userId = "alice", platform = Platform.IOS, pageSize = 10)

        assertEquals(1, res.total)
        assertEquals(
            DeviceSummary(
                id = "dev-1",
                userId = "alice",
                platform = Platform.IOS,
                status = "active",
                tags = listOf("vip"),
                timezone = "Europe/Istanbul",
                apnsEnvironment = "production",
                lastSeenAt = "2026-06-15T00:00:00Z",
                insertedAt = "2026-06-14T00:00:00Z",
            ),
            res.data.single(),
        )

        val req = stub.received.single()
        assertEquals("GET", req.method)
        assertTrue(req.path.startsWith("/api/v1/devices?"))
        assertTrue("user_id=alice" in req.path)
        assertTrue("platform=ios" in req.path)
        assertTrue("page_size=10" in req.path)
        assertEquals("ApiKey np_x", req.headers["Authorization"])
    }

    @Test fun `list omits optional query params when null`() = runTest {
        stub.enqueue(status = 200, body = """{"data":[],"total":0}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val res = client.devices.list()

        assertEquals(ListDevicesResult(data = emptyList(), total = 0), res)
        val req = stub.received.single()
        assertEquals("/api/v1/devices", req.path)
        assertTrue('?' !in req.path)
    }

    @Test fun `list never exposes the push token`() = runTest {
        // Even if the server were to (mistakenly) include a token, the SDK's
        // DeviceSummary has no field for it — so a caller can never read one.
        stub.enqueue(
            status = 200,
            body = """{"data":[{"id":"dev-1","user_id":null,"platform":"android","status":"active","tags":[],"timezone":null,"apns_environment":null,"last_seen_at":null,"inserted_at":"2026-06-14T00:00:00Z","token":"SECRET-fcm-token"}],"total":1}""",
        )

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val res = client.devices.list()

        val device = res.data.single()
        assertEquals("dev-1", device.id)
        assertEquals(null, device.userId)
        // DeviceSummary has no `token` member — assert via its string form too.
        assertTrue("SECRET-fcm-token" !in device.toString())
    }

    @Test fun `deactivateByToken DELETEs the devices endpoint with a token body`() = runTest {
        stub.enqueue(status = 200, body = """{"id":"dev-9","status":"inactive"}""")

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val res = client.devices.deactivateByToken("apns-token-xyz")

        assertEquals(DeviceDeactivateResult(id = "dev-9", status = "inactive"), res)

        val req = stub.received.single()
        assertEquals("DELETE", req.method)
        assertEquals("/api/v1/devices", req.path)
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals(mapOf("token" to "apns-token-xyz"), body)
    }

    @Test fun `deactivateByToken throws not_found on 404`() = runTest {
        stub.enqueue(
            status = 404,
            body = """{"error":{"code":"not_found","message":"Device not found"}}""",
        )

        val client = NitropingClient(apiKey = "np_x", baseUrl = stub.baseUrl)
        val err = assertThrows<ApiException> {
            client.devices.deactivateByToken("nope")
        }
        assertEquals(404, err.status)
        assertEquals("not_found", err.code)
    }
}
