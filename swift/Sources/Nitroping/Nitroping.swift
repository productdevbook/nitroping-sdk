//
//  Nitroping.swift
//  Nitroping
//
//  Zero-dependency Swift SDK for the Nitroping push notification service
//  (https://nitroping.dev).
//
//  Three areas:
//    1. Device registration  — register an APNs token after the user grants
//       permission, optionally bound to a `userId`.
//    2. Notification helpers — parse incoming `UNNotification` userInfo to
//       extract deep links, action buttons, and nitroping tracking ids; report
//       opens / clicks back to the service.
//    3. Webhook verification — for Swift on the server (Vapor, Hummingbird);
//       HMAC-SHA256 verification of `X-Nitroping-Signature`.
//
//  The package is a single product `Nitroping`. All public types are namespaced
//  with the `Nitroping` prefix to keep import-site references unambiguous.
//
//  Usage:
//      import Nitroping
//
//      let client = NitropingClient(apiKey: "np_live_...")
//      try await client.devices.register(.init(platform: .ios, token: tokenHex))
//

import Foundation

/// Package-wide version string. Sent as part of the `User-Agent` on every
/// outbound request so that the dashboard's device-list view can show
/// "registered from nitroping-swift/0.2.3".
public enum NitropingSDK {
    /// Semantic version. Bump in lock-step with git tags.
    public static let version = "0.2.6"

    /// Default base URL. Overridable on `NitropingClient.init` for staging /
    /// self-hosted deployments.
    public static let defaultBaseURL = URL(string: "https://nitroping.dev")!
}
