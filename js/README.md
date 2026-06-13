# nitroping (JavaScript / TypeScript SDK)

[![npm version](https://img.shields.io/npm/v/nitroping?logo=npm&color=cb3837)](https://www.npmjs.com/package/nitroping)
[![npm downloads](https://img.shields.io/npm/dm/nitroping?logo=npm)](https://www.npmjs.com/package/nitroping)
[![bundle size](https://img.shields.io/bundlephobia/minzip/nitroping?logo=javascript)](https://bundlephobia.com/package/nitroping)
[![license MIT](https://img.shields.io/npm/l/nitroping)](https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE)
[![types](https://img.shields.io/npm/types/nitroping?logo=typescript)](https://github.com/productdevbook/nitroping-sdk/tree/main/js)

> Zero-dependency TypeScript SDK for [nitroping](https://nitroping.dev) push notifications. Send pushes, register devices, verify webhooks. Pure ESM — Node, Bun, Deno, Cloudflare Workers, browsers.

> 📦 Part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo. The npm package name (`nitroping`) is unchanged. See the [root README](https://github.com/productdevbook/nitroping-sdk#readme) for SDKs in other languages.

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your app
with one HTTP call. The service handles fanout, retries, idempotency, quota
and outbound webhooks for delivery state — you write the product, not the
plumbing.

`nitroping-js` is the official TypeScript client. It has **zero runtime
dependencies**, ships as native ESM with full type definitions, and runs
anywhere modern JavaScript runs: Node 18+, Bun, Deno, Cloudflare Workers,
Vercel Edge, and the browser. The whole bundle is small enough to drop into
serverless without thinking about it.

## Install

```sh
npm install nitroping
# or
pnpm add nitroping
# or
bun add nitroping
# or
yarn add nitroping
```

## Quick Start

### Send a notification (server)

```ts
import { Nitroping } from "nitroping"

const np = new Nitroping({ apiKey: process.env.NITROPING_API_KEY! })

const result = await np.notifications.send(
  {
    title: "Order #4129 shipped",
    body: "Your package is on its way.",
    deepLink: "https://example.com/orders/4129",
    actions: [
      { id: "track", title: "Track" },
      { id: "view", title: "View order" },
    ],
    target: { userIds: ["user-42"] },
  },
  { idempotencyKey: "order-shipped-4129" },
)

console.log(result.id, result.status) // "abc-...", "queued"
```

### Register a Web Push device (browser)

```ts
import { subscribeWebPush } from "nitroping/web"

const { device } = await subscribeWebPush({
  publicKey: "pk_live_...",
  appId: "0e1d2c3b-4a59-6877-9876-543210abcdef",
  userId: "user-42",
})

console.log("Subscribed device", device.id)
```

Then drop a tiny `/public/sw.js` that handles `push`:

```js
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Notification", {
      body: data.body,
      icon: data.icon,
      data: { deepLink: data.deep_link },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.deepLink ?? "/"
  event.waitUntil(self.clients.openWindow(url))
})
```

### Verify a webhook (server)

```ts
import { verifyWebhook } from "nitroping/webhooks"

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("x-nitroping-signature")

  try {
    const event = await verifyWebhook({
      body,
      signature,
      secret: process.env.NITROPING_WEBHOOK_SECRET!,
    })

    if (event.type === "notification.delivered") {
      console.log("delivered", event.data["notification_id"])
    }
  } catch (err) {
    return new Response("signature error", { status: 400 })
  }

  return new Response("ok")
}
```

## Tree shaking

Three independent entry points — import only what you need:

```ts
import { Nitroping } from "nitroping" // server: send + devices
import { subscribeWebPush } from "nitroping/web" // browser: subscribe + register
import { verifyWebhook } from "nitroping/webhooks" // server: webhook verify
```

The `web` and `webhooks` modules don't pull the HTTP client in, so a server
that only verifies webhooks doesn't ship any request code, and a browser app
that only subscribes doesn't ship anything secret-key-flavored.

## API reference

### `new Nitroping(options)`

Creates a server-side client.

```ts
const np = new Nitroping({
  apiKey: "np_live_...", // or omit + set NITROPING_API_KEY env var
  baseUrl: "https://nitroping.dev", // optional, default shown
  timeoutMs: 30_000, // optional, default 30s. 0 = disable.
})
```

#### `np.notifications.send(input, options?)`

Sends a notification. Returns `{ id, status }`. Throws `NitropingError` on
non-2xx with the server's `code`, `message`, and per-field `details`.

```ts
await np.notifications.send(
  {
    title: "Welcome!",
    body: "Glad to have you on board.",
    icon: "https://example.com/icon.png",
    image: "https://example.com/hero.png",
    deepLink: "https://example.com/welcome",
    data: { onboarding: true },
    actions: [{ id: "tour", title: "Take the tour" }],
    target: { all: true },
  },
  { idempotencyKey: "welcome-user-42" },
)
```

`target` is a discriminated union — exactly one of:

| Selector               | Use when                         |
| ---------------------- | -------------------------------- |
| `{ all: true }`        | Broadcast to every active device |
| `{ deviceIds: [...] }` | Hit specific device rows         |
| `{ userIds: [...] }`   | Hit every device row a user owns |

Targets: `{ all: true }`, `{ deviceIds: [...] }`, `{ userIds: [...] }`, or
`{ tags: [...] }`.

#### `np.notifications.get(id)`

Fetch a previously-enqueued notification by id. Returns the full row
(with counters: `total_sent`, `total_delivered`, `total_failed`, etc).

```ts
const n = await np.notifications.get("abc-123")
console.log(n["counters"])
```

#### `np.notifications.cancel(id)`

Cancel a scheduled or in-flight notification. Returns
`{ id, status: "canceled" }`. Throws `code: "cannot_cancel"` (409) if it
already reached a terminal state.

```ts
await np.notifications.cancel("abc-123")
```

#### `np.devices.register(input)`

Register a device with the **secret** API key. Use this for iOS / Android
where you control the server. Returns `{ id, created }` — `created` is
`false` when an existing row matched on `(token, user_id)`.

```ts
await np.devices.register({
  platform: "ios",
  token: deviceToken, // raw APNs hex token
  userId: "user-42",
  tags: ["beta"],
  metadata: { app_version: "2.4.1" },
})
```

#### `np.devices.update(id, input)`

Update a device — currently its `tags` (used for tag-based targeting).
Returns `{ id, tags }`.

```ts
await np.devices.update("device-id", { tags: ["beta", "vip"] })
```

#### `np.devices.deactivate(id)`

Sets `status = inactive` on the device row. Subsequent sends skip it.

```ts
await np.devices.deactivate("device-id")
```

#### `np.track.record(input)`

Report a delivery/open/click signal (`POST /api/v1/track`). Identify the
target either by `deliveryLogId` or by `notificationId + deviceToken`.

```ts
await np.track.record({ deliveryLogId: "log-1", event: "delivered" })
await np.track.record({ notificationId: "n-1", deviceToken: "tok", event: "opened" })
```

#### `np.events.report(input)`

Report an engagement event (`POST /api/v1/events`) — the public,
unauthenticated endpoint a client app calls when a notification is opened
or an action is clicked.

```ts
await np.events.report({
  notificationId: "n-1",
  deviceId: "d-1",
  type: "clicked",
  actionId: "reply",
})
```

### `subscribeWebPush(options)` — `nitroping/web`

Browser-only. Registers a service worker, asks for permission, fetches the
VAPID public key, calls `pushManager.subscribe`, and registers the resulting
endpoint with nitroping — all in one call.

```ts
import { subscribeWebPush } from "nitroping/web"

const { device, subscription } = await subscribeWebPush({
  publicKey: "pk_live_...", // public, safe to ship in bundles
  appId: "uuid-of-the-app",
  serviceWorkerPath: "/sw.js", // optional, default shown
  serviceWorkerScope: "/", // optional
  userId: "user-42", // optional — enables { userIds: [...] }
})
```

Idempotent — call on every page load; the server dedupes on
`(app_id, token)`.

### `verifyWebhook(options)` — `nitroping/webhooks`

Verifies the `X-Nitroping-Signature` header and returns the parsed event.

```ts
import { verifyWebhook } from "nitroping/webhooks"

const event = await verifyWebhook({
  body: rawString,
  signature: request.headers.get("x-nitroping-signature"),
  secret: process.env.NITROPING_WEBHOOK_SECRET!,
  tolerance: 300, // optional, seconds. Default 300.
})
```

The signing scheme is HMAC-SHA256 over `"<unix>.<raw body>"`. The header
ships as `t=<unix>, v1=<hex>` — same as Polar / Stripe. Use the raw
request body string (not a re-serialized parsed object) or the HMAC won't
match.

## Framework recipes

### Express / Fastify webhook handler

```ts
import express from "express"
import { verifyWebhook } from "nitroping/webhooks"

const app = express()

app.post(
  "/webhooks/nitroping",
  express.raw({ type: "application/json" }), // keep the raw body
  async (req, res) => {
    try {
      const event = await verifyWebhook({
        body: req.body.toString("utf8"),
        signature: req.header("x-nitroping-signature"),
        secret: process.env.NITROPING_WEBHOOK_SECRET!,
      })
      // ...handle event...
      res.status(200).send("ok")
    } catch {
      res.status(400).send("bad signature")
    }
  },
)
```

### Hono / Cloudflare Workers

```ts
import { Hono } from "hono"
import { Nitroping } from "nitroping"
import { verifyWebhook } from "nitroping/webhooks"

interface Env {
  NITROPING_API_KEY: string
  NITROPING_WEBHOOK_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.post("/send", async (c) => {
  const np = new Nitroping({ apiKey: c.env.NITROPING_API_KEY })
  const result = await np.notifications.send({
    title: "Hello from Workers",
    body: "Running on the edge",
    target: { all: true },
  })
  return c.json(result)
})

app.post("/webhooks", async (c) => {
  const event = await verifyWebhook({
    body: await c.req.text(),
    signature: c.req.header("x-nitroping-signature"),
    secret: c.env.NITROPING_WEBHOOK_SECRET,
  })
  return c.json({ received: event.id })
})

export default app
```

### Next.js App Router

```ts
// app/api/notify/route.ts
import { Nitroping } from "nitroping"

export const runtime = "edge"

export async function POST(request: Request) {
  const np = new Nitroping({ apiKey: process.env.NITROPING_API_KEY! })
  const { title, body } = await request.json()

  const result = await np.notifications.send({
    title,
    body,
    target: { all: true },
  })
  return Response.json(result)
}
```

```ts
// app/api/webhooks/nitroping/route.ts
import { verifyWebhook } from "nitroping/webhooks"

export async function POST(request: Request) {
  const body = await request.text()
  const event = await verifyWebhook({
    body,
    signature: request.headers.get("x-nitroping-signature"),
    secret: process.env.NITROPING_WEBHOOK_SECRET!,
  })

  // event.type: "notification.delivered" | "notification.failed" |
  //             "notification.opened" | "notification.clicked" | "webhook.test"
  return Response.json({ ok: true, type: event.type })
}
```

## Errors

Every error thrown by the SDK extends `NitropingError`. Narrow by `instanceof`
to handle specific cases:

| Class                      | When it fires                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `NitropingError`           | Base class. Any non-2xx response, or any internal failure with no more specific subclass. |
| `NetworkError`             | `fetch` rejected (DNS, TLS, offline, abort). Original cause attached via `cause`.         |
| `InvalidSignatureError`    | `verifyWebhook` HMAC mismatch, missing header, malformed header.                          |
| `TimestampOutOfRangeError` | `verifyWebhook` signature valid but `t=` outside the tolerance window.                    |
| `WebPushUnsupportedError`  | `subscribeWebPush` running where Service Worker / Push API isn't available.               |
| `PermissionDeniedError`    | `subscribeWebPush` and the user (or browser policy) blocks notifications.                 |

```ts
import { Nitroping, NitropingError, NetworkError } from "nitroping"

try {
  await np.notifications.send({ title: "Hi", body: "There", target: { all: true } })
} catch (err) {
  if (err instanceof NetworkError) {
    // transient — retry with backoff
  } else if (err instanceof NitropingError && err.code === "quota_exceeded") {
    // surface "upgrade your plan" UI
    console.log(err.details) // { quota, used, resets_at }
  } else {
    throw err
  }
}
```

## TypeScript

Type declarations ship in the package — no separate `@types/...` install
needed. The SDK targets `ESNext` with strict mode and avoids `any` in the
public surface. All public types (`SendNotificationRequest`,
`NotificationTarget`, `WebhookEvent`, etc.) are exported from the main
entry.

## Runtime support

| Runtime             | Status                                       |
| ------------------- | -------------------------------------------- |
| Node 18 +           | Yes                                          |
| Bun 1.0 +           | Yes                                          |
| Deno 1.30 +         | Yes                                          |
| Cloudflare Workers  | Yes                                          |
| Vercel Edge Runtime | Yes                                          |
| Modern browsers     | Yes (`nitroping/web` + `nitroping/webhooks`) |

`nitroping` (the server SDK) is also usable in the browser, but you should
**not** ship the secret `np_` key — use `nitroping/web` with a public `pk_`
key instead.

## License

MIT — see [LICENSE](https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE). Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping-sdk#readme">monorepo</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
