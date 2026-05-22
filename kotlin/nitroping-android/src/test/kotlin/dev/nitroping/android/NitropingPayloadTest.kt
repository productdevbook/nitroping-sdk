/*
 * NitropingPayloadTest.kt
 *
 * The Android sugar module is a thin wrapper around `Map<String, String>`
 * decoding. We can fully unit-test it without an Android device by feeding
 * the same `Map<String, String>` shape FCM hands to `onMessageReceived`.
 */

package dev.nitroping.android

import dev.nitroping.Action
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class NitropingPayloadTest {
    @Test fun `parses deep_link and actions from a real-looking RemoteMessage data map`() {
        val data = mapOf(
            "deep_link" to "https://example.com/orders/4129",
            "actions_json" to """[{"id":"track","title":"Track"},{"id":"view","title":"View"}]""",
            "nitroping_notification_id" to "notif_42",
            "nitroping_device_id" to "dev_7",
            "nitroping_platform" to "android",
            "custom_key" to "custom_value",
        )

        val payload = NitropingPayload(data)

        assertEquals("https://example.com/orders/4129", payload.deepLink)
        assertEquals(
            listOf(
                Action(id = "track", title = "Track"),
                Action(id = "view", title = "View"),
            ),
            payload.actions,
        )
        assertEquals("notif_42", payload.notificationId)
        assertEquals("dev_7", payload.deviceId)
        assertEquals("android", payload.platform)
        assertEquals(mapOf("custom_key" to "custom_value"), payload.data)
        assertTrue(payload.isNitropingPayload)
    }

    @Test fun `missing fields become nulls`() {
        val payload = NitropingPayload(emptyMap())
        assertNull(payload.deepLink)
        assertEquals(emptyList(), payload.actions)
        assertNull(payload.notificationId)
        assertNull(payload.deviceId)
        assertNull(payload.platform)
        assertEquals(emptyMap(), payload.data)
        assertFalse(payload.isNitropingPayload)
    }

    @Test fun `falls back to non-prefixed ids when nitroping_ variants are absent`() {
        val payload = NitropingPayload(
            mapOf(
                "notification_id" to "notif_x",
                "device_id" to "dev_x",
                "platform" to "android",
            ),
        )
        assertEquals("notif_x", payload.notificationId)
        assertEquals("dev_x", payload.deviceId)
        assertEquals("android", payload.platform)
    }

    @Test fun `tolerates malformed actions_json silently`() {
        val payload = NitropingPayload(
            mapOf(
                "deep_link" to "https://example.com/x",
                "actions_json" to "not-json",
            ),
        )
        assertEquals(emptyList(), payload.actions)
        assertEquals("https://example.com/x", payload.deepLink)
    }

    @Test fun `actions can come pre-shaped under the actions key`() {
        val payload = NitropingPayload(
            mapOf(
                "actions" to """[{"id":"a","title":"A"}]""",
            ),
        )
        assertEquals(listOf(Action(id = "a", title = "A")), payload.actions)
    }
}
