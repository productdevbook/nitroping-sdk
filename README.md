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

## Release process

All SDKs ship in lockstep — same version across `js`, `swift`, `python`, `go`, `kotlin`, `php`.

```bash
./bump.sh 0.2.0
git push origin main --follow-tags
```

The push fires `.github/workflows/release.yml`:

| Job        | Status                    | Trigger when to enable          |
|------------|---------------------------|---------------------------------|
| npm        | active                    | `NPM_TOKEN` already configured  |
| PyPI       | disabled (`if: false`)    | add `PYPI_TOKEN` secret         |
| Maven      | disabled (`if: false`)    | add 5 Sonatype OSSRH secrets    |
| Packagist  | n/a (webhook auto-index)  | one-time submit at packagist.org|
| Go         | n/a (`pkg.go.dev` fetches on demand) | one-time `go get` to warm cache |
| Swift      | n/a (Swift Package Index re-indexes nightly) | one-time submit at swiftpackageindex.com |

The `bump.sh` script also tags `go/v<X.Y.Z>` (Go modules subdir convention) so `go get github.com/productdevbook/nitroping-sdk/go@v<X.Y.Z>` resolves.

## Versioning policy

Lockstep — one source-of-truth `VERSION` file at the repo root drives every SDK manifest. Even when only one SDK has functional changes, all SDKs get the same bump. Trade-off accepted: keeps the cross-language story simple ("are you on 0.2? then features X, Y, Z are available everywhere") at the cost of occasional no-op republishes.

## License

MIT — see [LICENSE](./LICENSE).
