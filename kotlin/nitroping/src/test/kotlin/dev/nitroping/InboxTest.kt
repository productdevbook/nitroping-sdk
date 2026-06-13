/*
 * InboxTest.kt
 *
 * Stubs the HTTP server and exercises the `np.inbox` client — list (with
 * query params), unread count, mark-read, mark-all-read — asserting the
 * SDK sends the right requests and parses the snake_case wire into
 * [InboxItem] / counts.
 */

package dev.nitroping

import dev.nitroping.internal.Json
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InboxTest {
    private lateinit var stub: HttpStub

    @BeforeEach fun setup() { stub = HttpStub() }
    @AfterEach fun teardown() { stub.close() }

    @Test fun `list GETs the public inbox with query params and maps items`() = runTest {
        stub.enqueue(
            status = 200,
            body = """{"items":[{"id":"ib_1","notification_id":"notif_1","title":"Hi","body":"There","data":{"order_id":"o1"},"deep_link":"https://x/y","read":false,"read_at":null,"inserted_at":"2026-06-13T00:00:00Z"}]}""",
        )

        val client = NitropingClient(apiKey = "pk_test", baseUrl = stub.baseUrl)
        val items = client.inbox.list(userId = "user-42", unreadOnly = true, limit = 10)

        assertEquals(1, items.size)
        assertEquals(
            InboxItem(
                id = "ib_1",
                notificationId = "notif_1",
                title = "Hi",
                body = "There",
                data = mapOf("order_id" to "o1"),
                deepLink = "https://x/y",
                read = false,
                readAt = null,
                insertedAt = "2026-06-13T00:00:00Z",
            ),
            items.single(),
        )

        val req = stub.received.single()
        assertEquals("GET", req.method)
        assertTrue(req.path.startsWith("/api/v1/public/inbox?"))
        assertTrue("user_id=user-42" in req.path)
        assertTrue("unread_only=true" in req.path)
        assertTrue("limit=10" in req.path)
        assertEquals("Public pk_test", req.headers["Authorization"])
    }

    @Test fun `list omits optional query params when null`() = runTest {
        stub.enqueue(status = 200, body = """{"items":[]}""")

        val client = NitropingClient(apiKey = "pk_test", baseUrl = stub.baseUrl)
        val items = client.inbox.list(userId = "u1")

        assertTrue(items.isEmpty())
        val req = stub.received.single()
        assertEquals("/api/v1/public/inbox?user_id=u1", req.path)
        assertTrue("unread_only" !in req.path)
        assertTrue("limit" !in req.path)
    }

    @Test fun `unreadCount reads unread_count`() = runTest {
        stub.enqueue(status = 200, body = """{"unread_count":7}""")

        val client = NitropingClient(apiKey = "pk_test", baseUrl = stub.baseUrl)
        val count = client.inbox.unreadCount("u1")

        assertEquals(7, count)
        val req = stub.received.single()
        assertEquals("GET", req.method)
        assertEquals("/api/v1/public/inbox/unread_count?user_id=u1", req.path)
    }

    @Test fun `markRead POSTs to the item read endpoint with user_id body`() = runTest {
        stub.enqueue(
            status = 200,
            body = """{"id":"ib_1","notification_id":"notif_1","read":true,"read_at":"2026-06-13T01:00:00Z"}""",
        )

        val client = NitropingClient(apiKey = "pk_test", baseUrl = stub.baseUrl)
        val item = client.inbox.markRead(userId = "u1", itemId = "ib_1")

        assertEquals("ib_1", item.id)
        assertEquals(true, item.read)
        assertEquals("2026-06-13T01:00:00Z", item.readAt)

        val req = stub.received.single()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/public/inbox/ib_1/read", req.path)
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals("u1", body["user_id"])
    }

    @Test fun `markAllRead POSTs read_all and returns marked_read`() = runTest {
        stub.enqueue(status = 200, body = """{"marked_read":3}""")

        val client = NitropingClient(apiKey = "pk_test", baseUrl = stub.baseUrl)
        val n = client.inbox.markAllRead("u1")

        assertEquals(3, n)
        val req = stub.received.single()
        assertEquals("POST", req.method)
        assertEquals("/api/v1/public/inbox/read_all", req.path)
        val body = Json.decode(req.body) as Map<*, *>
        assertEquals("u1", body["user_id"])
    }
}
