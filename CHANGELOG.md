# Changelog

All notable changes to nitroping SDKs across every language. SDKs ship in lockstep — one section per version covers every language.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **JavaScript / TypeScript** — `nitroping/widgets`: two drop-in, framework-agnostic browser UI components (plain DOM, no framework dependency, one injected stylesheet, public `pk_` auth):
  - `mountPushPrompt()` — a web-push opt-in card that runs the full `subscribeWebPush` flow on click and auto-hides when push is unsupported or the user has already decided.
  - `mountInboxBell()` — a notification bell with an unread badge + dropdown inbox; polls the unread count, lazy-loads the list on open, and marks items read on click. Returns a handle with `refresh()` / `unmount()`. Both accept theme overrides.

## [0.1.0] — 2026-05-23

### Added
- Initial release of nitroping SDKs across six languages:
  - **JavaScript / TypeScript** (`js/`): server client + browser web push subscribe + webhook verifier
  - **Swift** (`swift/`): iOS / macOS / watchOS / tvOS / visionOS — device registration, notification payload parser, webhook verifier
  - **Python** (`python/`): server client + webhook verifier — sync + async
  - **Go** (`go/`): server client + webhook verifier
  - **Kotlin** (`kotlin/`): core (JVM) + nitroping-android module — server client + Android payload helper + webhook verifier
  - **PHP** (`php/`): server client + webhook verifier — PHP 8.2+
- Wire-format consistency: every SDK ships a locked HMAC-SHA256 test vector matching the server's signature format (`t=<unix>, v1=<hex>`).
- Zero or near-zero runtime dependencies in every SDK.

[Unreleased]: https://github.com/productdevbook/nitroping-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/productdevbook/nitroping-sdk/releases/tag/v0.1.0
