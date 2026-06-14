# nitroping SDKs

Official client libraries for **[nitroping](https://nitroping.dev)** — one
platform to reach every device: **push** (iOS/APNs, Android/FCM, Web Push) plus
**email, SMS, and Slack**.

The SDKs wrap the REST API so you don't hand-roll HTTP calls. Depending on the
language they let you:

- **Register & manage device tokens** (APNs / FCM / Web Push endpoints).
- **Send & target notifications** — to a device, a user, everyone, tags,
  rule-based segments, or a topic; now, scheduled, or recurring.
- **Subscribe browsers to Web Push** and drop in ready-made **UI widgets** (a
  permission prompt + an inbox bell) — JS only.
- **Read the in-app inbox** and report engagement / conversions.
- **Verify webhooks** (HMAC-SHA256), server-side.

Full guides + the interactive API reference: **<https://nitroping.dev/docs>**.

## Pick your SDK

| Language | Install | Source | Docs |
|---|---|---|---|
| TypeScript / JavaScript | [`nitroping`](https://npmjs.com/package/nitroping) on npm | [`js/`](./js/) | [README](./js/README.md) |
| React Native | [`nitroping-react-native`](https://npmjs.com/package/nitroping-react-native) on npm | [`react-native/`](./react-native/) | [README](./react-native/README.md) |
| Python | [`nitroping`](https://pypi.org/project/nitroping/) on PyPI | [`python/`](./python/) | [README](./python/README.md) |
| Go | `go get github.com/productdevbook/nitroping-sdk/go` | [`go/`](./go/) | [README](./go/README.md) |
| PHP | [`productdevbook/nitroping`](https://packagist.org/packages/productdevbook/nitroping) on Packagist | [`php/`](./php/) | [README](./php/README.md) |
| Swift | Swift Package Manager (this repo) | [`swift/`](./swift/) | [README](./swift/README.md) |
| Kotlin / Android | Maven Central, group `dev.nitroping` *(publishing soon)* | [`kotlin/`](./kotlin/) | [README](./kotlin/README.md) |

## Quickstart

Server-side send with the JavaScript SDK:

```bash
npm i nitroping
```

```ts
import { Nitroping } from "nitroping"

const np = new Nitroping({ apiKey: "np_..." }) // secret key, server-side only

await np.notifications.send({
  target: { all: true },
  title: "Hello 👋",
  body: "Your first notification.",
})
```

Browser code uses a **public** `pk_…` key instead — see the
[JS README](./js/README.md) for `nitroping/web` (subscribe to Web Push) and
`nitroping/widgets` (drop-in UI). Each language README has its own quickstart.

## Wire-format reference

Every SDK speaks the same HTTP API. The canonical reference is the docs site:

- **API**: <https://nitroping.dev/docs> (interactive reference at `/api/docs`)
- **Auth**: `Authorization: ApiKey np_…` (secret, server) or
  `Authorization: Public pk_…` (public, browser/mobile-safe)
- **Webhook signature**: `X-Nitroping-Signature: t=<unix>, v1=<hmac_sha256_hex>`
  over `<unix>.<raw_body>`
- **Idempotency**: `Idempotency-Key` header on `POST /api/v1/notifications`

## License

MIT — see [LICENSE](./LICENSE).

---

## For maintainers

<details>
<summary>Monorepo layout, lockstep versioning, and the release process</summary>

### Why a monorepo

Every SDK speaks the same wire format. Keeping them in one repo lets us evolve
the protocol surface in one PR + one commit instead of N coordinated PRs across
N repos. Each SDK still ships independently to its own registry with
per-language tags.

### Versioning

Lockstep — a single source-of-truth `VERSION` file at the repo root drives every
SDK manifest. Even when only one SDK changes, all SDKs get the same bump.
Trade-off accepted: it keeps the cross-language story simple ("on 0.2? then
features X/Y/Z are available everywhere") at the cost of occasional no-op
republishes.

### Cutting a release

```bash
./bump.sh <X.Y.Z>            # bump VERSION + every manifest, commit, tag
git push origin main --follow-tags
```

`bump.sh` also creates a `go/v<X.Y.Z>` tag (Go modules subdir convention) so
`go get github.com/productdevbook/nitroping-sdk/go@v<X.Y.Z>` resolves. The push
fires `.github/workflows/release.yml`, which publishes to each registry whose
credentials are configured (npm + PyPI via OIDC/token today; Maven Central is
wired but gated on the Sonatype secrets being present).

### Packagist (PHP)

Submit `https://github.com/productdevbook/nitroping-sdk` once at
<https://packagist.org/packages/submit>; afterwards each tag is auto-indexed.
Packagist reads the root `composer.json`, and `.gitattributes` strips the
other-language directories from the dist archive, so PHP users only download the
PHP package.

</details>
