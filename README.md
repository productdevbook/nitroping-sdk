# nitroping SDKs

Official client libraries for **[nitroping.dev](https://nitroping.dev)** — push notifications for iOS, Android, and the web.

| Language | Status | Folder | Package | Docs |
|---|---|---|---|---|
| TypeScript / JavaScript | Released | [`js/`](./js/) | [`nitroping`](https://npmjs.com/package/nitroping) on npm | [README](./js/README.md) |
| Swift | Released | [`swift/`](./swift/) | Swift Package Manager | [README](./swift/README.md) |
| Python | In progress | [`python/`](./python/) | `nitroping` on PyPI | [README](./python/README.md) |
| Go | In progress | [`go/`](./go/) | `github.com/productdevbook/nitroping-sdk/go` | [README](./go/README.md) |
| Kotlin | In progress | [`kotlin/`](./kotlin/) | Maven Central | [README](./kotlin/README.md) |
| PHP | In progress | [`php/`](./php/) | Packagist | [README](./php/README.md) |

## Wire-format reference

All SDKs share the same HTTP API + signature format. The canonical reference lives in the server repo:
- API: <https://nitroping.dev/docs>
- Webhook signature: `X-Nitroping-Signature: t=<unix>, v1=<hmac_sha256_hex>` over `<unix>.<raw_body>`
- Idempotency: `Idempotency-Key` header on `POST /api/v1/notifications`

## Why monorepo

Every SDK speaks the same wire format. Keeping them in one repo lets us update the protocol surface in one PR + one commit instead of N coordinated PRs across N repos. Each SDK still ships independently to its own package registry (npm, PyPI, Swift Package Index, Maven Central, etc.) with per-language tags (`js/v0.1.0`, `swift/v0.1.0`, `go/v0.1.0`, …).

## Release tags

Each SDK is released independently with a prefixed git tag:

- `js/v0.1.0` → npm `nitroping@0.1.0`
- `swift/v0.1.0` → Swift Package Index 0.1.0
- `python/v0.1.0` → PyPI `nitroping==0.1.0`
- `go/v0.1.0` → `github.com/productdevbook/nitroping-sdk/go@v0.1.0`
- `kotlin/v0.1.0` → Maven Central `dev.nitroping:nitroping:0.1.0`
- `php/v0.1.0` → Packagist `productdevbook/nitroping:0.1.0`

## License

MIT — see [LICENSE](./LICENSE).
