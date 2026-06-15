# Changelog

All notable changes to nitroping SDKs across every language. SDKs ship in lockstep — one section per version covers every language.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.13] — 2026-06-15

### Added
- **All server SDKs** (JavaScript/TypeScript, Go, Python, PHP, Kotlin, Swift) — coverage for the new device + notification API surface:
  - **List devices** — `GET /api/v1/devices` (secret key), filterable by `user_id`, `platform`, `status`, with pagination. Returns the app's devices without ever exposing the push token. (e.g. JS `devices.list({ userId })`)
  - **Deactivate by token** — `DELETE /api/v1/devices` with a `{ token }` body, for the logout flow where the client knows the provider token but not the device id. (e.g. JS `devices.deactivateByToken(token)`)
  - **`apnsCategory`** on send-notification — sets `aps.category` verbatim so an iOS app that registered a matching `UNNotificationCategory` renders rich-push action buttons.
- **React Native** — `deactivateDeviceByToken(token)` on the device client for token-based logout. (List + `apnsCategory` are intentionally not exposed: they are secret-key / server-side surfaces, out of scope for a device-side public-key client.)

## [0.2.12] — 2026-06-14

### Fixed
- **React Native** — `NitropingProvider` now forwards the `debug` option (and the rest of `NitropingDeviceOptions`) to the `NitropingDevice` it builds from inline props. Previously the provider's memoized client only received `publicKey`/`baseUrl`/`timeoutMs`/`fetch`, so `<NitropingProvider publicKey="pk_..." debug>` had no effect. (#16)

## [0.2.11] — 2026-06-14

### Added
- **JavaScript / TypeScript** — `nitroping/widgets`: two drop-in, framework-agnostic browser UI components (plain DOM, no framework dependency, one injected stylesheet, public `pk_` auth):
  - `mountPushPrompt()` — a web-push opt-in card that runs the full `subscribeWebPush` flow on click and auto-hides when push is unsupported or the user has already decided.
  - `mountInboxBell()` — a notification bell with an unread badge + dropdown inbox; polls the unread count, lazy-loads the list on open, and marks items read on click. Returns a handle with `refresh()` / `unmount()`. Both accept theme overrides.

## [0.1.0] — 2026-05-23

### Added
- Initial release of nitroping SDKs across six languages (the React Native SDK was added in a later release):
  - **JavaScript / TypeScript** (`js/`): server client + browser web push subscribe + webhook verifier
  - **Swift** (`swift/`): iOS / macOS / watchOS / tvOS / visionOS — device registration, notification payload parser, webhook verifier
  - **Python** (`python/`): server client + webhook verifier — sync + async
  - **Go** (`go/`): server client + webhook verifier
  - **Kotlin** (`kotlin/`): core (JVM) + nitroping-android module — server client + Android payload helper + webhook verifier
  - **PHP** (`php/`): server client + webhook verifier — PHP 8.2+
- Wire-format consistency: every SDK ships a locked HMAC-SHA256 test vector matching the server's signature format (`t=<unix>, v1=<hex>`).
- Zero or near-zero runtime dependencies in every SDK.

[Unreleased]: https://github.com/productdevbook/nitroping-sdk/compare/v0.2.12...HEAD
[0.2.12]: https://github.com/productdevbook/nitroping-sdk/releases/tag/v0.2.12
[0.2.11]: https://github.com/productdevbook/nitroping-sdk/releases/tag/v0.2.11
[0.1.0]: https://github.com/productdevbook/nitroping-sdk/releases/tag/v0.1.0
