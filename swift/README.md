# nitroping (Swift SDK)

[![Swift versions](https://img.shields.io/endpoint?url=https%3A%2F%2Fswiftpackageindex.com%2Fapi%2Fpackages%2Fproductdevbook%2Fnitroping-sdk%2Fbadge%3Ftype%3Dswift-versions)](https://swiftpackageindex.com/productdevbook/nitroping-sdk)
[![Platforms](https://img.shields.io/endpoint?url=https%3A%2F%2Fswiftpackageindex.com%2Fapi%2Fpackages%2Fproductdevbook%2Fnitroping-sdk%2Fbadge%3Ftype%3Dplatforms)](https://swiftpackageindex.com/productdevbook/nitroping-sdk)
[![license MIT](https://img.shields.io/github/license/productdevbook/nitroping-sdk)](https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE)

> Zero-dependency Swift SDK for [nitroping](https://nitroping.dev) push notifications. Register devices, parse incoming pushes (deep links + action buttons), verify webhooks. Uses only `Foundation`, `CryptoKit`, `UserNotifications`, `URLSession`, and `os.log` — no third-party Swift Package dependencies.

> 📦 Part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo. The Swift Package URL is `https://github.com/productdevbook/nitroping-sdk` (was: `nitroping-swift`). See the [root README](https://github.com/productdevbook/nitroping-sdk#readme) for SDKs in other languages.

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your
app with one HTTP call. The service handles fanout, retries, idempotency,
quota and outbound webhooks for delivery state — you write the product,
not the plumbing.

`nitroping` (Swift) is the official Apple-platform client. It runs on
iOS 16+, macOS 13+, watchOS 9+, tvOS 16+, and visionOS 1+ with **no
third-party Swift Package dependencies** — just `Foundation`,
`CryptoKit`, `UserNotifications`, `URLSession`, and `os.log`. The same
package is usable on server Swift (Linux/macOS) for webhook verification
in Vapor / Hummingbird.

## Install

Add the package to your `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/productdevbook/nitroping-sdk", from: "0.1.0")
]
```

…then add `Nitroping` to your target's dependencies:

```swift
.target(
    name: "MyApp",
    dependencies: [
        .product(name: "Nitroping", package: "nitroping-sdk")
    ]
)
```

In Xcode, use **File → Add Package Dependencies…** and paste `https://github.com/productdevbook/nitroping-sdk`.

## Quickstart

```swift
import Nitroping

NitropingClient.configure(apiKey: "np_live_xxxxxxxxxxxxxxxxxxxx")
```

Replace `np_live_…` with the API key from the **API Keys** tab of your app in the nitroping panel.

## 1. Device registration

Register the APNs token in `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`. The call is idempotent on `(app, token, userId)`, so calling it on every launch is safe.

```swift
import UIKit
import UserNotifications
import Nitroping

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        NitropingClient.configure(apiKey: "np_live_xxxxxxxxxxxxxxxxxxxx")
        UNUserNotificationCenter.current().delegate = NotificationDelegate.shared

        Task {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run { application.registerForRemoteNotifications() }
            }
        }
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()

        Task {
            do {
                let response = try await NitropingClient.shared.devices.register(
                    .init(
                        platform: .ios,
                        token: tokenHex,
                        userId: CurrentUser.shared.id,
                        metadata: [
                            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
                            "locale": Locale.current.identifier
                        ]
                    )
                )
                UserDefaults.standard.set(response.id, forKey: "nitroping.device_id")
            } catch {
                // Log and retry on next launch — register is idempotent.
                print("Nitroping register failed: \(error)")
            }
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("APNs registration failed: \(error)")
    }
}
```

## 2. Deep links + action buttons

Parse the userInfo through `NitropingPayload` from your `UNUserNotificationCenter` delegate. The same payload shape is produced for tap-the-body, tap-an-action, and presentation-while-foreground.

```swift
import SwiftUI
import UserNotifications
import Nitroping

final class NotificationDelegate: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationDelegate()

    // Foreground presentation — show the banner even when the app is open.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    // User tapped the body or an action button.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let payload = NitropingPayload(notification: response.notification)

        // Route the deep link to your NavigationStack / Router.
        if let url = payload.deepLink {
            DispatchQueue.main.async {
                Router.shared.open(url)
            }
        }

        // Report engagement back to nitroping. Use Task.detached so we
        // never block the system completion handler.
        let isAction = response.actionIdentifier != UNNotificationDefaultActionIdentifier
                    && response.actionIdentifier != UNNotificationDismissActionIdentifier
        if let notificationId = payload.notificationId,
           let deviceId = payload.deviceId {
            Task.detached {
                try? await NitropingClient.shared.events.report(
                    notificationId: notificationId,
                    deviceId: deviceId,
                    type: isAction ? .clicked : .opened,
                    actionId: isAction ? response.actionIdentifier : nil
                )
            }
        }

        completionHandler()
    }
}

// Example NavigationStack-based router.
@MainActor
final class Router: ObservableObject {
    static let shared = Router()
    @Published var path = NavigationPath()

    func open(_ url: URL) {
        // myapp://order/42 → push OrderDetailView(id: "42")
        guard url.scheme == "myapp" else {
            UIApplication.shared.open(url)
            return
        }
        switch url.host {
        case "order":
            if let id = url.pathComponents.dropFirst().first {
                path.append(Route.order(id: id))
            }
        default:
            break
        }
    }

    enum Route: Hashable { case order(id: String) }
}
```

### Legacy `UIApplication.shared.open` routing

If you don't use SwiftUI's `NavigationStack`, hand the URL to `UIApplication.shared.open` and let your existing `application(_:open:options:)` deep-link handler take it from there:

```swift
if let url = payload.deepLink {
    DispatchQueue.main.async {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
}
```

## 3. Registering action categories

Action buttons declared on the server (`actions: [{id: "reply", title: "Reply"}, ...]`) only render if your iOS app has registered a matching `UNNotificationCategory` at launch. The category identifier the server uses is `nitroping_actions_<hash>`, where `<hash>` is derived from the `(app_id, actions)` pair — but for most apps it's simpler to declare one stable category per logical type of notification and tell the server which one to attach.

Register the category once, early in `didFinishLaunchingWithOptions`:

```swift
import UserNotifications

func registerNotificationCategories() {
    // Categories you'll dispatch to in the panel as `category: "order_update"`.
    let reply = UNNotificationAction(
        identifier: "reply",
        title: "Reply",
        options: [.foreground]
    )
    let archive = UNNotificationAction(
        identifier: "archive",
        title: "Archive",
        options: [.destructive]
    )

    let orderUpdate = UNNotificationCategory(
        identifier: "order_update",
        actions: [reply, archive],
        intentIdentifiers: [],
        options: [.customDismissAction]
    )

    UNUserNotificationCenter.current().setNotificationCategories([orderUpdate])
}
```

In the panel — or via `client.notifications.create` — send with matching `actions`:

```json
{
  "title": "Your order shipped",
  "body": "Track it from the app.",
  "data": { "deep_link": "myapp://order/42" },
  "actions": [
    { "id": "reply",   "title": "Reply" },
    { "id": "archive", "title": "Archive" }
  ]
}
```

When the user taps **Reply**, the delegate fires with `response.actionIdentifier == "reply"` — exactly the `id` you registered.

## 4. Server-side webhook verification

For Swift on the server (Vapor, Hummingbird) — verify the `X-Nitroping-Signature` header on every inbound webhook before trusting the body.

### Hummingbird

```swift
import Hummingbird
import Nitroping

func nitropingWebhook(req: Request, context: some RequestContext) async throws -> Response {
    let body = try await req.body.collect(upTo: 1_048_576)
    let bodyData = Data(buffer: body)
    let signature = req.headers[values: HTTPField.Name("X-Nitroping-Signature")!].first

    let event: NitropingEvent
    do {
        event = try NitropingWebhook.verify(
            body: bodyData,
            signature: signature,
            secret: Environment.process.NITROPING_WEBHOOK_SECRET ?? "",
            tolerance: 300
        )
    } catch let error as NitropingError {
        // Don't leak detail to the sender — a generic 400 is fine.
        return Response(status: .badRequest)
    }

    switch event.kind {
    case .delivered, .opened, .clicked:
        // Persist / forward to your analytics pipeline.
        try await EventPipeline.shared.record(event)
    case .failed:
        try await EventPipeline.shared.recordFailure(event)
    case .test:
        // The user clicked "Send test event" in the panel. No-op.
        break
    case .unknown(let raw):
        req.logger.info("Unknown nitroping event type: \(raw)")
    }
    return Response(status: .ok)
}
```

### Vapor

```swift
import Vapor
import Nitroping

func boot(routes: RoutesBuilder) {
    routes.post("webhooks", "nitroping") { req async throws -> HTTPStatus in
        guard let buffer = req.body.data else { throw Abort(.badRequest) }
        let bodyData = Data(buffer: buffer)
        let signature = req.headers["X-Nitroping-Signature"].first
        let secret = Environment.get("NITROPING_WEBHOOK_SECRET") ?? ""

        let event: NitropingEvent
        do {
            event = try NitropingWebhook.verify(
                body: bodyData,
                signature: signature,
                secret: secret
            )
        } catch {
            req.logger.warning("nitroping webhook verify failed: \(error)")
            throw Abort(.badRequest)
        }

        switch event.kind {
        case .delivered:
            req.logger.info("notification delivered: \(event.data.notificationId ?? "?")")
        case .opened, .clicked:
            try await Analytics.record(event)
        case .failed:
            try await Alerting.notifyOps(event)
        case .test, .unknown:
            break
        }
        return .ok
    }
}
```

The verification routine also rejects timestamps outside the tolerance window (default 5 minutes) — a stolen signature can't be replayed indefinitely.

## Errors

Every error funnels through `NitropingError`:

```swift
public enum NitropingError: Error, Equatable, Sendable {
    case validation(String)
    case transport(String)
    case unauthorized(message: String)
    case forbidden(message: String, code: String?)
    case notFound(message: String)
    case validationFailed(message: String, details: [String: [String]]?)
    case rateLimited(message: String, retryAfter: TimeInterval?)
    case server(status: Int, code: String?, message: String)
    case decoding(String)

    // Webhook-only:
    case missingSignature
    case invalidSignature
    case timestampOutOfRange(skew: TimeInterval, tolerance: TimeInterval)
}
```

Pattern-match at the call site:

```swift
do {
    try await NitropingClient.shared.devices.register(.init(platform: .ios, token: token))
} catch NitropingError.unauthorized {
    Auth.shared.refreshAPIKey()
} catch NitropingError.rateLimited(_, let retryAfter) {
    let delay = retryAfter ?? 30
    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
    // …retry
} catch {
    Crashlytics.log(error)
}
```

## Customisation

### Custom base URL (staging, self-hosted)

```swift
NitropingClient.configure(
    apiKey: "np_test_...",
    baseURL: URL(string: "https://staging.nitroping.dev")!
)
```

### Custom URLSession (proxy, certificate pinning)

```swift
let config = URLSessionConfiguration.default
config.connectionProxyDictionary = ProxyConfig.dictionary
let session = URLSession(configuration: config)

NitropingClient.configure(
    apiKey: "np_live_...",
    session: session
)
```

## Runtime support

| Platform          | Minimum |
| ----------------- | ------- |
| iOS               | 16.0    |
| macOS             | 13.0    |
| watchOS           | 9.0     |
| tvOS              | 16.0    |
| visionOS          | 1.0     |
| Swift on Linux    | 6.0     |
| Swift toolchain   | 6.0+    |

## License

MIT — see [LICENSE](https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE). Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping-sdk#readme">monorepo</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
