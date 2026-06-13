//
//  ClientTests.swift
//  NitropingTests
//

import XCTest
@testable import Nitroping

final class ClientTests: XCTestCase {
    let baseURL = URL(string: "https://api.test.nitroping.dev")!

    override func setUp() {
        super.setUp()
        URLProtocolStub.reset()
    }

    private func makeClient() -> NitropingClient {
        let session = URLProtocolStub.makeSession()
        return NitropingClient(apiKey: "np_test_abcd", baseURL: baseURL, session: session)
    }

    private func makePublicClient() -> NitropingClient {
        let session = URLProtocolStub.makeSession()
        return NitropingClient(apiKey: "pk_test_abcd", baseURL: baseURL, session: session)
    }

    func testDeviceRegisterSendsCorrectHeadersAndBody() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"dev_xyz","created":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.devices.register(
            .init(
                platform: .ios,
                token: "abcdef0123",
                userId: "user-42",
                metadata: ["app_version": "1.0.0"]
            )
        )

        XCTAssertEqual(response.id, "dev_xyz")
        XCTAssertTrue(response.created)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/devices")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "ApiKey np_test_abcd")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/json")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Accept"), "application/json")
        let ua = try XCTUnwrap(req.value(forHTTPHeaderField: "User-Agent"))
        XCTAssertTrue(ua.hasPrefix("nitroping-swift/"))

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: bodyData) as? [String: Any]
        )
        XCTAssertEqual(json["token"] as? String, "abcdef0123")
        XCTAssertEqual(json["platform"] as? String, "ios")
        XCTAssertEqual(json["user_id"] as? String, "user-42")
        let metadata = try XCTUnwrap(json["metadata"] as? [String: String])
        XCTAssertEqual(metadata["app_version"], "1.0.0")
    }

    func testUnauthorizedResponseThrowsUnauthorized() async throws {
        URLProtocolStub.nextStub = .init(
            status: 401,
            body: Data(#"{"error":{"code":"invalid_api_key","message":"Bad key"}}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        do {
            _ = try await client.devices.register(.init(platform: .ios, token: "deadbeef"))
            XCTFail("expected throw")
        } catch let NitropingError.unauthorized(message) {
            XCTAssertEqual(message, "Bad key")
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testValidationFailedSurfacesDetails() async throws {
        URLProtocolStub.nextStub = .init(
            status: 422,
            body: Data(#"{"error":{"code":"validation_failed","message":"bad","details":{"token":["required"]}}}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        do {
            _ = try await client.devices.register(.init(platform: .ios, token: "x"))
            XCTFail("expected throw")
        } catch let NitropingError.validationFailed(message, details) {
            XCTAssertEqual(message, "bad")
            XCTAssertEqual(details?["token"], ["required"])
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testRateLimitedSurfacesRetryAfter() async throws {
        URLProtocolStub.nextStub = .init(
            status: 429,
            body: Data(#"{"error":{"code":"quota_exceeded","message":"over quota"}}"#.utf8),
            headers: ["Retry-After": "120"]
        )

        let client = makeClient()
        do {
            _ = try await client.devices.register(.init(platform: .ios, token: "tok"))
            XCTFail("expected throw")
        } catch let NitropingError.rateLimited(_, retryAfter) {
            XCTAssertEqual(retryAfter, 120)
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testEventReportSendsBody() async throws {
        URLProtocolStub.nextStub = .init(
            status: 202,
            body: Data(#"{"accepted":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        try await client.events.report(
            notificationId: "notif_1",
            deviceId: "dev_2",
            type: .clicked,
            actionId: "reply"
        )

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.url?.path, "/api/v1/events")
        XCTAssertNil(req.value(forHTTPHeaderField: "Authorization-Required-Marker"))
        // Authorization header still goes out — the public events endpoint
        // tolerates it; the SDK doesn't strip it. Just confirm body shape.
        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["notification_id"] as? String, "notif_1")
        XCTAssertEqual(json["device_id"] as? String, "dev_2")
        XCTAssertEqual(json["type"] as? String, "clicked")
        XCTAssertEqual(json["action_id"] as? String, "reply")
    }

    func testEmptyTokenFailsLocally() async throws {
        let client = makeClient()
        do {
            _ = try await client.devices.register(.init(platform: .ios, token: ""))
            XCTFail("expected throw")
        } catch let NitropingError.validation(message) {
            XCTAssertTrue(message.contains("token"))
        } catch {
            XCTFail("wrong error: \(error)")
        }
        // Should never have hit the network.
        XCTAssertNil(URLProtocolStub.lastRequest)
    }

    // MARK: - Notifications.create encoding

    func testNotificationCreateEncodesAllFields() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_1","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.notifications.create(
            .init(
                title: "Hi",
                body: "There",
                target: .tags(["premium", "tr"]),
                template: "welcome",
                templateVars: ["name": "Ada"],
                deepLink: URL(string: "myapp://home"),
                clickAction: "https://example.com",
                icon: "https://example.com/icon.png",
                image: "https://example.com/img.png",
                actions: [NitropingAction(id: "reply", title: "Reply")],
                data: ["k": "v"]
            ),
            idempotencyKey: "order-1"
        )

        XCTAssertEqual(response.id, "notif_1")
        XCTAssertEqual(response.status, "queued")

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/notifications")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Idempotency-Key"), "order-1")

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["title"] as? String, "Hi")
        XCTAssertEqual(json["body"] as? String, "There")
        XCTAssertEqual(json["template"] as? String, "welcome")
        XCTAssertEqual((json["vars"] as? [String: String])?["name"], "Ada")
        XCTAssertEqual(json["deep_link"] as? String, "myapp://home")
        XCTAssertEqual(json["click_action"] as? String, "https://example.com")
        XCTAssertEqual(json["icon"] as? String, "https://example.com/icon.png")
        XCTAssertEqual(json["image"] as? String, "https://example.com/img.png")
        XCTAssertEqual((json["data"] as? [String: String])?["k"], "v")
        let target = try XCTUnwrap(json["target"] as? [String: Any])
        XCTAssertEqual(target["tags"] as? [String], ["premium", "tr"])
        let actions = try XCTUnwrap(json["actions"] as? [[String: Any]])
        XCTAssertEqual(actions.first?["id"] as? String, "reply")
        XCTAssertEqual(actions.first?["title"] as? String, "Reply")
    }

    func testNotificationCreateOmitsNilFields() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_2","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(
            .init(title: "Only title", body: nil, target: .all)
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["title"] as? String, "Only title")
        XCTAssertNil(json["template"])
        XCTAssertNil(json["icon"])
        let target = try XCTUnwrap(json["target"] as? [String: Any])
        XCTAssertEqual(target["all"] as? Bool, true)
    }

    // MARK: - Notifications.cancel

    func testNotificationCancel() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"id":"notif_1","status":"canceled"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.notifications.cancel(id: "notif_1")

        XCTAssertEqual(response.id, "notif_1")
        XCTAssertEqual(response.status, "canceled")

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "DELETE")
        XCTAssertEqual(req.url?.path, "/api/v1/notifications/notif_1")
    }

    func testNotificationCancelEmptyIdFailsLocally() async throws {
        let client = makeClient()
        do {
            _ = try await client.notifications.cancel(id: "")
            XCTFail("expected throw")
        } catch let NitropingError.validation(message) {
            XCTAssertTrue(message.contains("id"))
        }
        XCTAssertNil(URLProtocolStub.lastRequest)
    }

    // MARK: - Device update

    func testDeviceUpdateSendsPutWithTags() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"id":"dev_1","tags":["premium","tr"]}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.devices.update(id: "dev_1", tags: ["premium", "tr"])

        XCTAssertEqual(response.id, "dev_1")
        XCTAssertEqual(response.tags, ["premium", "tr"])

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "PUT")
        XCTAssertEqual(req.url?.path, "/api/v1/devices/dev_1")

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["tags"] as? [String], ["premium", "tr"])
    }

    func testDeviceRegisterIncludesTags() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"dev_1","created":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.devices.register(
            .init(platform: .ios, token: "tok", tags: ["a", "b"])
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["tags"] as? [String], ["a", "b"])
    }

    // MARK: - Track

    func testTrackByDeliveryLogId() async throws {
        URLProtocolStub.nextStub = .init(
            status: 202,
            body: Data(#"{"accepted":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.track.record(
            deliveryLogId: "dl_1",
            event: .delivered
        )

        XCTAssertTrue(response.accepted)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/track")

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["delivery_log_id"] as? String, "dl_1")
        XCTAssertEqual(json["event"] as? String, "delivered")
        XCTAssertNil(json["notification_id"])
    }

    func testTrackByNotificationAndToken() async throws {
        URLProtocolStub.nextStub = .init(
            status: 202,
            body: Data(#"{"accepted":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.track.record(
            notificationId: "notif_1",
            deviceToken: "abc123",
            event: .clicked
        )

        XCTAssertTrue(response.accepted)

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["notification_id"] as? String, "notif_1")
        XCTAssertEqual(json["device_token"] as? String, "abc123")
        XCTAssertEqual(json["event"] as? String, "clicked")
        XCTAssertNil(json["delivery_log_id"])
    }

    // MARK: - VAPID fetch

    func testVapidPublicKeyFetch() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"public_key":"BPk_test_key"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        let key = try await client.publicApi.vapidPublicKey(appId: "app_1")

        XCTAssertEqual(key, "BPk_test_key")

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "GET")
        XCTAssertEqual(req.url?.path, "/api/v1/public/apps/app_1/vapid")
    }

    // MARK: - Public-key scheme routing

    func testPublicKeyUsesPublicSchemeAndPublicDevicePath() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"dev_pub","created":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        _ = try await client.devices.register(.init(platform: .web, token: "endpoint"))

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.url?.path, "/api/v1/public/devices")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Public pk_test_abcd")
    }
}
