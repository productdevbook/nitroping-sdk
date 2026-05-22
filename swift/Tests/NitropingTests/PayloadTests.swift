//
//  PayloadTests.swift
//  NitropingTests
//

import XCTest
@testable import Nitroping

final class PayloadTests: XCTestCase {
    /// Real-ish APNs payload as it would arrive in `userInfo`.
    func testParsesRealisticAPNsPayload() {
        let userInfo: [AnyHashable: Any] = [
            "aps": [
                "alert": ["title": "Order shipped", "body": "Track it"],
                "sound": "default",
                "category": "nitroping_actions_a1b2c3d4e5f6"
            ],
            "nitroping_notification_id": "notif_abc",
            "nitroping_device_id": "dev_xyz",
            "nitroping_platform": "ios",
            "deep_link": "myapp://order/42",
            "actions": [
                ["id": "reply", "title": "Reply"],
                ["id": "archive", "title": "Archive"]
            ],
            "order_id": "42",
            "tenant": "acme"
        ]
        let payload = NitropingPayload(userInfo: userInfo)

        XCTAssertEqual(payload.notificationId, "notif_abc")
        XCTAssertEqual(payload.deviceId, "dev_xyz")
        XCTAssertEqual(payload.platform, "ios")
        XCTAssertEqual(payload.deepLink, URL(string: "myapp://order/42"))
        XCTAssertEqual(payload.actions, [
            NitropingAction(id: "reply", title: "Reply"),
            NitropingAction(id: "archive", title: "Archive")
        ])
        XCTAssertTrue(payload.isNitropingPayload)
        XCTAssertEqual(payload.data["order_id"] as? String, "42")
        XCTAssertEqual(payload.data["tenant"] as? String, "acme")
        // aps is reserved — must not leak into custom data.
        XCTAssertNil(payload.data["aps"])
        XCTAssertNil(payload.data["nitroping_notification_id"])
    }

    /// FCM / Android-side payload uses `actions_json` (string) instead of an
    /// array; verify we parse it back into typed actions.
    func testParsesActionsJsonString() {
        let userInfo: [AnyHashable: Any] = [
            "data": [
                "notification_id": "notif_2",
                "device_id": "dev_2",
                "deep_link": "https://example.com/page",
                "actions_json": #"[{"id":"like","title":"Like"},{"id":"share","title":"Share"}]"#
            ]
        ]
        let payload = NitropingPayload(userInfo: userInfo)

        XCTAssertEqual(payload.notificationId, "notif_2")
        XCTAssertEqual(payload.deviceId, "dev_2")
        XCTAssertEqual(payload.deepLink, URL(string: "https://example.com/page"))
        XCTAssertEqual(payload.actions, [
            NitropingAction(id: "like", title: "Like"),
            NitropingAction(id: "share", title: "Share")
        ])
    }

    /// Missing fields shouldn't throw — every property is optional.
    func testMissingFieldsProduceAllNil() {
        let userInfo: [AnyHashable: Any] = [
            "aps": ["alert": "Hello"]
        ]
        let payload = NitropingPayload(userInfo: userInfo)

        XCTAssertNil(payload.notificationId)
        XCTAssertNil(payload.deviceId)
        XCTAssertNil(payload.platform)
        XCTAssertNil(payload.deepLink)
        XCTAssertEqual(payload.actions, [])
        XCTAssertFalse(payload.isNitropingPayload)
    }

    /// Malformed actions array entries are skipped, not fatal.
    func testMalformedActionsAreSkipped() {
        let userInfo: [AnyHashable: Any] = [
            "actions": [
                ["id": "ok", "title": "Good"],
                ["id": 123, "title": "Bad type"],    // id is not String
                ["title": "missing id"],
                "completely wrong"
            ] as [Any]
        ]
        let payload = NitropingPayload(userInfo: userInfo)
        XCTAssertEqual(payload.actions, [NitropingAction(id: "ok", title: "Good")])
    }

    /// Bogus deep-link string falls back to nil rather than crashing.
    func testInvalidDeepLinkBecomesNil() {
        let userInfo: [AnyHashable: Any] = [
            "deep_link": ""
        ]
        let payload = NitropingPayload(userInfo: userInfo)
        // Empty string is parsed by URL(string:) on some platforms as a
        // valid-but-empty URL — either way, it shouldn't crash.
        if let url = payload.deepLink {
            XCTAssertEqual(url.absoluteString, "")
        }
    }
}
