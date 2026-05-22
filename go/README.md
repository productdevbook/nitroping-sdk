# nitroping-go

> This package is part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo.
> See the [top-level README](../README.md) for SDKs in other languages.

<p align="center">
  <br>
  <b style="font-size: 2em;">nitroping-go</b>
  <br><br>
  Zero-dependency Go SDK for <a href="https://nitroping.dev">nitroping</a>.
  <br>
  Send push notifications, register devices, verify webhooks. Stdlib only.
  <br><br>
  <a href="https://pkg.go.dev/github.com/productdevbook/nitroping-sdk/go"><img src="https://pkg.go.dev/badge/github.com/productdevbook/nitroping-sdk/go.svg" alt="Go reference"></a>
  <a href="https://goreportcard.com/report/github.com/productdevbook/nitroping-sdk/go"><img src="https://goreportcard.com/badge/github.com/productdevbook/nitroping-sdk/go" alt="Go report card"></a>
  <a href="https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/nitroping-sdk?style=flat&colorA=18181B&colorB=34d399" alt="license"></a>
</p>

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your app
with one HTTP call. The service handles fanout, retries, idempotency, quota,
and outbound webhooks for delivery state — you write the product, not the
plumbing.

`nitroping-go` is the official Go client. **Zero third-party dependencies** —
just `net/http`, `encoding/json`, and `crypto/hmac`. Drop it into any Go 1.22+
service, Cloud Run worker, AWS Lambda, or CLI without thinking about a
dependency footprint.

## Install

```sh
go get github.com/productdevbook/nitroping-sdk/go
```

Import it as `nitroping`:

```go
import "github.com/productdevbook/nitroping-sdk/go"
```

## Quick Start

### Send a notification

```go
package main

import (
    "context"
    "log"
    "os"

    "github.com/productdevbook/nitroping-sdk/go"
)

func main() {
    client, err := nitroping.NewClient(nitroping.ClientOptions{
        APIKey: os.Getenv("NITROPING_API_KEY"),
    })
    if err != nil {
        log.Fatal(err)
    }

    res, err := client.Notifications.Send(context.Background(), nitroping.SendRequest{
        Title:    "Order #4129 shipped",
        Body:     "Your package is on its way.",
        DeepLink: nitroping.String("https://example.com/orders/4129"),
        Actions: []nitroping.Action{
            {ID: "track", Title: "Track"},
            {ID: "view", Title: "View order"},
        },
        Target: nitroping.UserIDs([]string{"user-42"}),
    }, nitroping.WithIdempotencyKey("order-shipped-4129"))
    if err != nil {
        log.Fatal(err)
    }
    log.Printf("queued: id=%s status=%s", res.ID, res.Status)
}
```

### Register a device (iOS / Android)

```go
err := client.Devices.Register(ctx, nitroping.DeviceRequest{
    Platform: nitroping.PlatformIOS,
    Token:    apnsToken,
    UserID:   nitroping.String("user-42"),
    Metadata: map[string]any{"app_version": "2.4.1"},
})
```

Web Push subscriptions are produced in the browser — for that flow use the
[`nitroping/web`](../js/README.md) JavaScript module. The Go SDK is
server-side only.

### Verify a webhook

```go
package main

import (
    "io"
    "net/http"
    "os"

    "github.com/productdevbook/nitroping-sdk/go/webhooks"
)

func nitropingWebhook(w http.ResponseWriter, r *http.Request) {
    body, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "read body", http.StatusBadRequest)
        return
    }

    event, err := webhooks.Verify(webhooks.VerifyOptions{
        Body:      body,
        Signature: r.Header.Get(webhooks.SignatureHeader),
        Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    })
    if err != nil {
        http.Error(w, "signature", http.StatusBadRequest)
        return
    }

    switch event.Type {
    case "notification.delivered":
        // event.Data["notification_id"] etc.
    }

    w.WriteHeader(http.StatusOK)
}
```

## API reference

### `nitroping.NewClient(ClientOptions) (*Client, error)`

```go
client, err := nitroping.NewClient(nitroping.ClientOptions{
    APIKey:     "np_live_...",            // or set NITROPING_API_KEY env var
    BaseURL:    "https://nitroping.dev",  // optional, default shown
    HTTPClient: http.DefaultClient,       // optional, override transport
    UserAgent:  "myapp/1.0",              // optional, default: nitroping-go/<ver>
})
```

`NewClient` returns an error rather than panicking, so library code embedding
the SDK can degrade gracefully when configuration is missing.

### `client.Notifications.Send(ctx, SendRequest, ...RequestOption) (*NotificationResult, error)`

Enqueues a notification. Returns `{ID, Status}` (typically `Status="queued"`).
Non-2xx responses are returned as `*APIError`.

```go
res, err := client.Notifications.Send(ctx, nitroping.SendRequest{
    Title:    "Welcome!",
    Body:     "Glad to have you on board.",
    Icon:     nitroping.String("https://example.com/icon.png"),
    Image:    nitroping.String("https://example.com/hero.png"),
    DeepLink: nitroping.String("https://example.com/welcome"),
    Data:     map[string]any{"onboarding": true},
    Actions:  []nitroping.Action{{ID: "tour", Title: "Take the tour"}},
    Target:   nitroping.AllDevices(),
}, nitroping.WithIdempotencyKey("welcome-user-42"))
```

`Target` is constructed via one of three helpers — exactly one applies per
send:

| Helper                    | Use when                         |
| ------------------------- | -------------------------------- |
| `AllDevices()`            | Broadcast to every active device |
| `DeviceIDs([]string{...})` | Hit specific device rows        |
| `UserIDs([]string{...})`   | Hit every device row a user owns |

### `client.Notifications.Get(ctx, id) (map[string]any, error)`

Fetches a previously-enqueued notification by id. Returns the full server-side
row (including the `counters` map) as a generic map so the SDK doesn't have
to track every server-side schema change.

```go
row, err := client.Notifications.Get(ctx, "abc-123")
if err != nil {
    return err
}
counters := row["counters"].(map[string]any)
```

### `client.Devices.Register(ctx, DeviceRequest) (*DeviceResult, error)`

Registers (or updates) a device. The endpoint is idempotent on
`(app_id, token, user_id)` — sending the same triple twice returns the
existing row with `Created=false`.

### `client.Devices.Deactivate(ctx, id) (*DeactivateResult, error)`

Soft-deletes a device (`status = inactive`). Future sends skip it. Returns
`*APIError` with `Code="not_found"` if the id doesn't belong to your app.

### Request options

| Option                              | Effect                                              |
| ----------------------------------- | --------------------------------------------------- |
| `WithIdempotencyKey(string)`        | Adds `Idempotency-Key` header (max 255 chars)       |
| `WithHeader(name, value string)`    | Adds an arbitrary header to a single request        |

### `webhooks.Verify(VerifyOptions) (*Event, error)` — subpackage

Verifies an `X-Nitroping-Signature` header and returns the parsed event.

```go
event, err := webhooks.Verify(webhooks.VerifyOptions{
    Body:      rawBody,
    Signature: r.Header.Get("X-Nitroping-Signature"),
    Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    Tolerance: 300 * time.Second, // optional, default 300s
})
```

The signing scheme is HMAC-SHA256 over `"<unix>.<raw body>"`. The header ships
as `t=<unix>, v1=<hex>` — same as Polar / Stripe. Use the **raw** request body
bytes (do not re-serialise a parsed `map[string]any`) or the HMAC will not
match.

## Framework recipes

### `net/http`

```go
http.HandleFunc("/webhooks/nitroping", func(w http.ResponseWriter, r *http.Request) {
    body, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "read", http.StatusBadRequest)
        return
    }
    event, err := webhooks.Verify(webhooks.VerifyOptions{
        Body:      body,
        Signature: r.Header.Get(webhooks.SignatureHeader),
        Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    })
    if err != nil {
        http.Error(w, "bad signature", http.StatusBadRequest)
        return
    }
    log.Printf("event: %s", event.Type)
    w.WriteHeader(http.StatusOK)
})
```

### Gin

```go
r := gin.Default()
r.POST("/webhooks/nitroping", func(c *gin.Context) {
    body, _ := io.ReadAll(c.Request.Body)
    event, err := webhooks.Verify(webhooks.VerifyOptions{
        Body:      body,
        Signature: c.GetHeader(webhooks.SignatureHeader),
        Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    })
    if err != nil {
        c.String(http.StatusBadRequest, "bad signature")
        return
    }
    c.JSON(http.StatusOK, gin.H{"received": event.ID})
})
```

### Echo

```go
e := echo.New()
e.POST("/webhooks/nitroping", func(c echo.Context) error {
    body, _ := io.ReadAll(c.Request().Body)
    event, err := webhooks.Verify(webhooks.VerifyOptions{
        Body:      body,
        Signature: c.Request().Header.Get(webhooks.SignatureHeader),
        Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    })
    if err != nil {
        return c.String(http.StatusBadRequest, "bad signature")
    }
    return c.JSON(http.StatusOK, map[string]string{"received": event.ID})
})
```

### chi

```go
r := chi.NewRouter()
r.Post("/webhooks/nitroping", func(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    event, err := webhooks.Verify(webhooks.VerifyOptions{
        Body:      body,
        Signature: r.Header.Get(webhooks.SignatureHeader),
        Secret:    os.Getenv("NITROPING_WEBHOOK_SECRET"),
    })
    if err != nil {
        http.Error(w, "bad signature", http.StatusBadRequest)
        return
    }
    _ = event // ...handle event...
    w.WriteHeader(http.StatusOK)
})
```

## Errors

All errors implement the `error` interface. Three categories:

| Type / sentinel                          | Surfaced when                                                       |
| ---------------------------------------- | ------------------------------------------------------------------- |
| `*nitroping.APIError`                    | The server returned a non-2xx. Use `errors.As` to recover the type. |
| `nitroping.ErrInvalidSignature`          | `webhooks.Verify` HMAC mismatch or malformed header.                |
| `nitroping.ErrTimestampOutOfRange`       | `webhooks.Verify` valid HMAC but `t=` outside tolerance.            |
| `nitroping.ErrMissingSignatureHeader`    | `webhooks.Verify` called with empty `Signature`.                    |
| wrapped `*url.Error` / `context.Canceled` | Transport, DNS, TLS, timeout, request cancellation.                 |

```go
import "errors"

res, err := client.Notifications.Send(ctx, req)
if err != nil {
    var apiErr *nitroping.APIError
    switch {
    case errors.As(err, &apiErr):
        switch apiErr.Code {
        case "quota_exceeded":
            // surface "upgrade your plan" UI
            // apiErr.Details: {"quota": ..., "used": ..., "resets_at": ...}
        case "validation_failed":
            // apiErr.Details: per-field validation map
        default:
            log.Printf("api error %d %s: %s", apiErr.StatusCode, apiErr.Code, apiErr.Message)
        }
    case errors.Is(err, context.DeadlineExceeded):
        // retry with backoff
    default:
        // transport / network
    }
}
```

## Runtime support

| Runtime                | Status      |
| ---------------------- | ----------- |
| Go 1.22+               | Yes         |
| Cloud Run / Cloud Functions | Yes  |
| AWS Lambda (custom runtime) | Yes  |
| Fly.io / Render / Railway   | Yes  |

## License

[MIT](../LICENSE) — Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
