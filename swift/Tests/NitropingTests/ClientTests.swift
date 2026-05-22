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
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer np_test_abcd")
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
}
