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

    // MARK: - New notification fields (recurrence / email)

    func testNotificationCreateEncodesRecurrenceAndEmail() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_3","status":"scheduled"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(
            .init(
                title: "Daily",
                body: "Standup",
                target: .all,
                recurrence: "0 9 * * *",
                recurrenceTz: "Europe/Istanbul",
                recurrenceUntil: "2026-12-31T00:00:00Z",
                emailTo: ["a@example.com", "b@example.com"]
            )
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["recurrence"] as? String, "0 9 * * *")
        XCTAssertEqual(json["recurrence_tz"] as? String, "Europe/Istanbul")
        XCTAssertEqual(json["recurrence_until"] as? String, "2026-12-31T00:00:00Z")
        XCTAssertEqual(json["email_to"] as? [String], ["a@example.com", "b@example.com"])
    }

    func testNotificationCreateOmitsNilRecurrence() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_4","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(.init(title: "Hi", body: nil, target: .all))

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertNil(json["recurrence"])
        XCTAssertNil(json["recurrence_tz"])
        XCTAssertNil(json["email_to"])
    }

    // MARK: - Segment target

    func testNotificationCreateEncodesSegmentTarget() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_5","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(
            .init(
                title: "Hi",
                body: "Seg",
                target: .segment(match: "any", conditions: [
                    .equals("platform", "ios"),
                    SegmentCondition(field: "tag", op: "in", value: .stringArray(["premium", "tr"])),
                    .exists("user_id"),
                ])
            )
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        let target = try XCTUnwrap(json["target"] as? [String: Any])
        let segment = try XCTUnwrap(target["segment"] as? [String: Any])
        XCTAssertEqual(segment["match"] as? String, "any")
        let conditions = try XCTUnwrap(segment["conditions"] as? [[String: Any]])
        XCTAssertEqual(conditions.count, 3)
        XCTAssertEqual(conditions[0]["field"] as? String, "platform")
        XCTAssertEqual(conditions[0]["op"] as? String, "eq")
        XCTAssertEqual(conditions[0]["value"] as? String, "ios")
        XCTAssertEqual(conditions[1]["value"] as? [String], ["premium", "tr"])
        XCTAssertEqual(conditions[2]["op"] as? String, "exists")
        XCTAssertNil(conditions[2]["value"])
    }

    func testSegmentConvenienceDefaultsToMatchAll() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_6","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(
            .init(title: "Hi", body: nil, target: .segment([.equals("platform", "web")]))
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        let target = try XCTUnwrap(json["target"] as? [String: Any])
        let segment = try XCTUnwrap(target["segment"] as? [String: Any])
        XCTAssertEqual(segment["match"] as? String, "all")
    }

    // MARK: - Device timezone

    func testDeviceRegisterIncludesTimezone() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"dev_tz","created":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.devices.register(
            .init(platform: .ios, token: "tok", timezone: "Europe/Istanbul")
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["timezone"] as? String, "Europe/Istanbul")
    }

    // MARK: - Device list

    func testDeviceListSendsQueryAndDecodes() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"""
            {"data":[
              {"id":"dev_1","user_id":"alice","platform":"ios","status":"active","tags":["premium"],"timezone":"Europe/Istanbul","apns_environment":"production","last_seen_at":"2026-06-14T10:00:00Z","inserted_at":"2026-06-01T09:00:00Z"},
              {"id":"dev_2","user_id":null,"platform":"web","status":"inactive","tags":[],"timezone":null,"apns_environment":null,"last_seen_at":null,"inserted_at":"2026-06-02T09:00:00Z"}
            ],"total":2}
            """#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.devices.list(
            .init(userId: "alice", platform: .ios, status: .active, page: 2, pageSize: 10)
        )

        XCTAssertEqual(response.total, 2)
        XCTAssertEqual(response.data.count, 2)

        let first = response.data[0]
        XCTAssertEqual(first.id, "dev_1")
        XCTAssertEqual(first.userId, "alice")
        XCTAssertEqual(first.platform, .ios)
        XCTAssertEqual(first.status, .active)
        XCTAssertEqual(first.tags, ["premium"])
        XCTAssertEqual(first.timezone, "Europe/Istanbul")
        XCTAssertEqual(first.apnsEnvironment, .production)
        XCTAssertEqual(first.lastSeenAt, "2026-06-14T10:00:00Z")
        XCTAssertEqual(first.insertedAt, "2026-06-01T09:00:00Z")

        let second = response.data[1]
        XCTAssertEqual(second.id, "dev_2")
        XCTAssertNil(second.userId)
        XCTAssertEqual(second.platform, .web)
        XCTAssertEqual(second.status, .inactive)
        XCTAssertEqual(second.tags, [])
        XCTAssertNil(second.timezone)
        XCTAssertNil(second.apnsEnvironment)
        XCTAssertNil(second.lastSeenAt)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "GET")
        XCTAssertEqual(req.url?.path, "/api/v1/devices")
        let components = try XCTUnwrap(URLComponents(url: try XCTUnwrap(req.url), resolvingAgainstBaseURL: false))
        let queryItems = components.queryItems ?? []
        func queryValue(_ name: String) -> String? {
            queryItems.first { $0.name == name }?.value
        }
        XCTAssertEqual(queryValue("user_id"), "alice")
        XCTAssertEqual(queryValue("platform"), "ios")
        XCTAssertEqual(queryValue("status"), "active")
        XCTAssertEqual(queryValue("page"), "2")
        XCTAssertEqual(queryValue("page_size"), "10")
    }

    func testDeviceSummaryHasNoTokenField() throws {
        // The list endpoint never returns the push token. Decoding a row that
        // (hypothetically) carried one must still succeed and expose no token,
        // and the type must have no member that would surface it.
        let json = Data(#"""
        {"id":"dev_1","user_id":null,"platform":"ios","status":"active","tags":[],"timezone":null,"apns_environment":null,"last_seen_at":null,"inserted_at":"2026-06-01T09:00:00Z","token":"should-be-ignored"}
        """#.utf8)
        let summary = try JSONDecoder().decode(DeviceSummary.self, from: json)
        XCTAssertEqual(summary.id, "dev_1")

        // Round-trip the encoded form and confirm no `token` key is produced.
        let encoded = try JSONEncoder().encode(summary)
        let dict = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertNil(dict["token"])
        // Mirror confirms the struct declares no `token` stored property.
        let labels = Mirror(reflecting: summary).children.compactMap(\.label)
        XCTAssertFalse(labels.contains("token"))
    }

    func testDeviceListNoQueryOmitsQueryString() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"data":[],"total":0}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.devices.list()
        XCTAssertEqual(response.total, 0)
        XCTAssertTrue(response.data.isEmpty)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.url?.path, "/api/v1/devices")
        let components = try XCTUnwrap(URLComponents(url: try XCTUnwrap(req.url), resolvingAgainstBaseURL: false))
        XCTAssertNil(components.queryItems)
    }

    // MARK: - Device deactivate-by-token

    func testDeviceDeactivateByTokenSendsBodyAndDecodes() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"id":"dev_9","status":"inactive"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        let response = try await client.devices.deactivateByToken("apns-token-xyz")

        XCTAssertEqual(response.id, "dev_9")
        XCTAssertEqual(response.status, "inactive")

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "DELETE")
        // No id in the path — deactivate-by-token hits the collection route.
        XCTAssertEqual(req.url?.path, "/api/v1/devices")

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["token"] as? String, "apns-token-xyz")
        XCTAssertNil(json["id"])
    }

    func testDeviceDeactivateByTokenNotFound() async throws {
        URLProtocolStub.nextStub = .init(
            status: 404,
            body: Data(#"{"error":{"code":"not_found","message":"Device not found"}}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        do {
            _ = try await client.devices.deactivateByToken("nope")
            XCTFail("expected throw")
        } catch let NitropingError.notFound(message) {
            XCTAssertEqual(message, "Device not found")
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testDeviceDeactivateByTokenEmptyFailsLocally() async throws {
        let client = makeClient()
        do {
            _ = try await client.devices.deactivateByToken("")
            XCTFail("expected throw")
        } catch let NitropingError.validation(message) {
            XCTAssertTrue(message.contains("token"))
        }
        XCTAssertNil(URLProtocolStub.lastRequest)
    }

    // MARK: - apns_category

    func testNotificationCreateEncodesApnsCategory() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_cat","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(
            .init(
                title: "Refunded",
                body: "Your order was refunded",
                target: .all,
                apnsCategory: "order_refund"
            )
        )

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["apns_category"] as? String, "order_refund")
        XCTAssertNil(json["apnsCategory"])
    }

    func testNotificationCreateOmitsNilApnsCategory() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"notif_nocat","status":"queued"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makeClient()
        _ = try await client.notifications.create(.init(title: "Hi", body: nil, target: .all))

        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertNil(json["apns_category"])
    }

    // MARK: - Inbox

    func testInboxListSendsQueryAndDecodes() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"""
            {"items":[
              {"id":"inb_1","notification_id":"notif_1","title":"Hi","body":"There","deep_link":"myapp://x","read":false,"read_at":null,"inserted_at":"2026-06-13T10:00:00Z","data":{"k":"v","n":3}},
              {"id":"inb_2","notification_id":"notif_2","read":true,"read_at":"2026-06-13T11:00:00Z","inserted_at":"2026-06-13T09:00:00Z"}
            ]}
            """#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        let items = try await client.inbox.list(userId: "user-42", unreadOnly: true, limit: 20)

        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items[0].id, "inb_1")
        XCTAssertEqual(items[0].notificationId, "notif_1")
        XCTAssertEqual(items[0].title, "Hi")
        XCTAssertEqual(items[0].deepLink, "myapp://x")
        XCTAssertFalse(items[0].read)
        XCTAssertNil(items[0].readAt)
        XCTAssertEqual(items[0].insertedAt, "2026-06-13T10:00:00Z")
        XCTAssertEqual(items[0].data?["k"], .string("v"))
        XCTAssertEqual(items[0].data?["n"], .int(3))
        XCTAssertTrue(items[1].read)
        XCTAssertNil(items[1].title)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "GET")
        XCTAssertEqual(req.url?.path, "/api/v1/public/inbox")
        let components = try XCTUnwrap(URLComponents(url: try XCTUnwrap(req.url), resolvingAgainstBaseURL: false))
        let queryItems = components.queryItems ?? []
        func queryValue(_ name: String) -> String? {
            queryItems.first { $0.name == name }?.value
        }
        XCTAssertEqual(queryValue("user_id"), "user-42")
        XCTAssertEqual(queryValue("unread_only"), "true")
        XCTAssertEqual(queryValue("limit"), "20")
    }

    func testInboxUnreadCount() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"unread_count":7}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        let count = try await client.inbox.unreadCount(userId: "user-42")
        XCTAssertEqual(count, 7)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.url?.path, "/api/v1/public/inbox/unread_count")
    }

    func testInboxMarkRead() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"id":"inb_1","notification_id":"notif_1","read":true,"read_at":"2026-06-13T11:00:00Z"}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        let item = try await client.inbox.markRead(userId: "user-42", itemId: "inb_1")
        XCTAssertEqual(item.id, "inb_1")
        XCTAssertTrue(item.read)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/public/inbox/inb_1/read")
        let bodyData = try XCTUnwrap(URLProtocolStub.lastBody)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: bodyData) as? [String: Any])
        XCTAssertEqual(json["user_id"] as? String, "user-42")
    }

    func testInboxMarkAllRead() async throws {
        URLProtocolStub.nextStub = .init(
            status: 200,
            body: Data(#"{"marked_read":4}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let client = makePublicClient()
        let n = try await client.inbox.markAllRead(userId: "user-42")
        XCTAssertEqual(n, 4)

        let req = try XCTUnwrap(URLProtocolStub.lastRequest)
        XCTAssertEqual(req.httpMethod, "POST")
        XCTAssertEqual(req.url?.path, "/api/v1/public/inbox/read_all")
    }

    func testInboxEmptyUserIdFailsLocally() async throws {
        let client = makePublicClient()
        do {
            _ = try await client.inbox.unreadCount(userId: "")
            XCTFail("expected throw")
        } catch let NitropingError.validation(message) {
            XCTAssertTrue(message.contains("userId"))
        }
        XCTAssertNil(URLProtocolStub.lastRequest)
    }

    // MARK: - Debug logging

    func testDebugHandlerReceivesRequestAndResponseWithoutApiKey() async throws {
        URLProtocolStub.nextStub = .init(
            status: 201,
            body: Data(#"{"id":"dev_xyz","created":true}"#.utf8),
            headers: ["Content-Type": "application/json"]
        )

        let collector = DebugCollector()
        let session = URLProtocolStub.makeSession()
        let client = NitropingClient(
            apiKey: "np_test_secret_key",
            baseURL: baseURL,
            session: session,
            debug: { event in collector.append(event) }
        )
        _ = try await client.devices.register(.init(platform: .ios, token: "tok"))

        let events = collector.events
        XCTAssertTrue(events.contains { if case .request = $0 { return true } else { return false } })
        XCTAssertTrue(events.contains { if case .response = $0 { return true } else { return false } })

        // The API key must never appear in any emitted event.
        for event in events {
            switch event {
            case .request(let method, let url):
                XCTAssertEqual(method, "POST")
                XCTAssertFalse(url.contains("np_test_secret_key"))
            case .response(_, let url, let status, _):
                XCTAssertEqual(status, 201)
                XCTAssertFalse(url.contains("np_test_secret_key"))
            case .failure(_, let url, let error):
                XCTAssertFalse(url.contains("np_test_secret_key"))
                XCTAssertFalse(error.contains("np_test_secret_key"))
            }
        }
    }
}

/// Thread-safe collector for debug events used by `testDebugHandler...`.
private final class DebugCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var _events: [NitropingDebugEvent] = []
    func append(_ event: NitropingDebugEvent) {
        lock.lock(); defer { lock.unlock() }
        _events.append(event)
    }
    var events: [NitropingDebugEvent] {
        lock.lock(); defer { lock.unlock() }
        return _events
    }
}
