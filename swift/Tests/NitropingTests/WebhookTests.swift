//
//  WebhookTests.swift
//  NitropingTests
//

import XCTest
@testable import Nitroping

final class WebhookTests: XCTestCase {
    let secret = "whsec_test_supersecret"

    /// Build a `t=<ts>, v1=<hex>` header for a known body so we can
    /// round-trip it through `NitropingWebhook.verify`.
    private func sign(body: String, at timestamp: Int64) -> String {
        let signedPayload = "\(timestamp).\(body)"
        let v1 = SignatureUtil.hmacSHA256Hex(message: signedPayload, secret: secret)
        return "t=\(timestamp), v1=\(v1)"
    }

    func testVerifyValidSignatureReturnsEvent() throws {
        let now = Date()
        let ts = Int64(now.timeIntervalSince1970)
        let body = #"""
        {"id":"evt_abc","type":"notification.delivered","created_at":"2026-05-22T12:00:00Z","data":{"notification_id":"notif_1","device_id":"dev_1","platform":"ios"}}
        """#
        let header = sign(body: body, at: ts)

        let event = try NitropingWebhook.verify(
            body: Data(body.utf8),
            signature: header,
            secret: secret,
            tolerance: 300,
            now: now
        )

        XCTAssertEqual(event.id, "evt_abc")
        XCTAssertEqual(event.type, "notification.delivered")
        XCTAssertEqual(event.kind, .delivered)
        XCTAssertEqual(event.data.notificationId, "notif_1")
        XCTAssertEqual(event.data.deviceId, "dev_1")
        XCTAssertEqual(event.data.platform, "ios")
    }

    func testVerifyTamperedBodyThrowsInvalidSignature() throws {
        let now = Date()
        let ts = Int64(now.timeIntervalSince1970)
        let body = #"{"id":"evt_abc","type":"notification.delivered","created_at":"2026-05-22T12:00:00Z","data":{}}"#
        let header = sign(body: body, at: ts)

        // Tamper the body — flip a character — but keep the header.
        let tampered = body.replacingOccurrences(of: "evt_abc", with: "evt_xyz")
        XCTAssertNotEqual(tampered, body)

        do {
            _ = try NitropingWebhook.verify(
                body: Data(tampered.utf8),
                signature: header,
                secret: secret,
                now: now
            )
            XCTFail("expected throw")
        } catch NitropingError.invalidSignature {
            // expected
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testVerifyOldTimestampThrowsTimestampOutOfRange() throws {
        let now = Date()
        let oldTs = Int64(now.timeIntervalSince1970) - 1000   // 1000s ago
        let body = #"{"id":"evt_old","type":"webhook.test","created_at":"2026-05-22T12:00:00Z","data":{}}"#
        let header = sign(body: body, at: oldTs)

        do {
            _ = try NitropingWebhook.verify(
                body: Data(body.utf8),
                signature: header,
                secret: secret,
                tolerance: 300,
                now: now
            )
            XCTFail("expected throw")
        } catch NitropingError.timestampOutOfRange(let skew, let tolerance) {
            XCTAssertGreaterThan(skew, tolerance)
            XCTAssertEqual(tolerance, 300)
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testMissingSignatureHeaderThrows() throws {
        do {
            _ = try NitropingWebhook.verify(
                body: Data("{}".utf8),
                signature: nil,
                secret: secret
            )
            XCTFail("expected throw")
        } catch NitropingError.missingSignature {
            // expected
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testMalformedSignatureHeaderThrows() throws {
        do {
            _ = try NitropingWebhook.verify(
                body: Data("{}".utf8),
                signature: "garbage",
                secret: secret
            )
            XCTFail("expected throw")
        } catch NitropingError.missingSignature {
            // expected — header had no `t=` / `v1=`
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testKindForUnknownEventTypeRoundTrips() {
        let kind = NitropingEvent.Kind(rawValue: "notification.future_thing")
        XCTAssertEqual(kind, .unknown("notification.future_thing"))
    }

    func testHmacHexIsLowercaseHexAnd64Chars() {
        let hex = SignatureUtil.hmacSHA256Hex(message: "hello", secret: "world")
        XCTAssertEqual(hex.count, 64)
        XCTAssertTrue(hex.allSatisfy { ("0"..."9").contains($0) || ("a"..."f").contains($0) })
    }

    func testConstantTimeEqualHandlesDifferentLengths() {
        XCTAssertFalse(SignatureUtil.constantTimeEqual("abc", "abcd"))
        XCTAssertTrue(SignatureUtil.constantTimeEqual("abc", "abc"))
        XCTAssertFalse(SignatureUtil.constantTimeEqual("abc", "abd"))
    }
}
