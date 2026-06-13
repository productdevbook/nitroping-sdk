//
//  NitropingClient.swift
//  Nitroping
//

import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Top-level entry point for the Nitroping SDK.
///
/// Construct one (or set `NitropingClient.shared`) and call into the
/// subclients (`devices`, `events`, `notifications`).
///
/// ```swift
/// let client = NitropingClient(apiKey: "np_live_...")
/// try await client.devices.register(.init(platform: .ios, token: hex))
/// ```
///
/// The instance is `Sendable`; share it across tasks freely.
public final class NitropingClient: Sendable {
    /// Process-wide convenience singleton. Configure once at app launch
    /// with `NitropingClient.configure(apiKey:)` and the
    /// `UNUserNotificationCenter` delegate can reach it without an injected
    /// dependency.
    public static var shared: NitropingClient {
        guard let c = _shared.value else {
            fatalError("NitropingClient.shared accessed before NitropingClient.configure(apiKey:). Call configure first, or construct your own instance.")
        }
        return c
    }

    /// Configure the process-wide `shared` instance. Safe to call more than
    /// once; the last call wins.
    public static func configure(
        apiKey: String,
        baseURL: URL = NitropingSDK.defaultBaseURL,
        session: NitropingURLSession = URLSession.shared
    ) {
        _shared.value = NitropingClient(apiKey: apiKey, baseURL: baseURL, session: session)
    }

    private static let _shared = SharedBox()

    /// Device-registration endpoints.
    public let devices: Devices

    /// Engagement reporting (opens, clicks).
    public let events: Events

    /// Server-side notification creation. Most iOS apps won't use this;
    /// kept for parity with the TS SDK and for Swift-on-the-server users.
    public let notifications: Notifications

    /// Delivery-tracking callbacks (`POST /api/v1/track`). Used by
    /// server-side senders to report delivered / opened / clicked.
    public let track: Track

    /// Public, unauthenticated endpoints (VAPID key fetch).
    public let publicApi: PublicAPI

    private let transport: HTTPTransport

    /// Designated initializer.
    public init(
        apiKey: String,
        baseURL: URL = NitropingSDK.defaultBaseURL,
        session: NitropingURLSession = URLSession.shared
    ) {
        precondition(!apiKey.isEmpty, "Nitroping API key must not be empty")
        let userAgent = "nitroping-swift/\(NitropingSDK.version) (\(platformTag()))"
        let transport = HTTPTransport(
            baseURL: baseURL,
            apiKey: apiKey,
            session: session,
            userAgent: userAgent
        )
        self.transport = transport
        self.devices = Devices(transport: transport)
        self.events = Events(transport: transport)
        self.notifications = Notifications(transport: transport)
        self.track = Track(transport: transport)
        self.publicApi = PublicAPI(transport: transport)
    }

    // MARK: - Subclient declarations
    //
    // Methods live in the `NitropingClient+*.swift` extension files; this
    // keeps `NitropingClient.swift` small and lets readers find each area
    // by filename.

    /// Device-registration subclient.
    public final class Devices: Sendable {
        let transport: HTTPTransport
        init(transport: HTTPTransport) { self.transport = transport }
    }

    /// Engagement-reporting subclient.
    public final class Events: Sendable {
        let transport: HTTPTransport
        init(transport: HTTPTransport) { self.transport = transport }
    }

    /// Notification-creation subclient.
    public final class Notifications: Sendable {
        let transport: HTTPTransport
        init(transport: HTTPTransport) { self.transport = transport }
    }

    /// Delivery-tracking subclient.
    public final class Track: Sendable {
        let transport: HTTPTransport
        init(transport: HTTPTransport) { self.transport = transport }
    }

    /// Public (unauthenticated) endpoints subclient.
    public final class PublicAPI: Sendable {
        let transport: HTTPTransport
        init(transport: HTTPTransport) { self.transport = transport }
    }
}

// MARK: - Internal helpers

/// Tiny `Sendable` reference box for the optional `shared` slot. Locks
/// around the read/write so a configure-while-accessing race is benign.
private final class SharedBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: NitropingClient?
    var value: NitropingClient? {
        get { lock.lock(); defer { lock.unlock() }; return _value }
        set { lock.lock(); defer { lock.unlock() }; _value = newValue }
    }
}

private func platformTag() -> String {
    #if os(iOS)
    return "iOS"
    #elseif os(macOS)
    return "macOS"
    #elseif os(watchOS)
    return "watchOS"
    #elseif os(tvOS)
    return "tvOS"
    #elseif os(visionOS)
    return "visionOS"
    #elseif os(Linux)
    return "Linux"
    #else
    return "unknown"
    #endif
}
