> Part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo.
> The PyPI package name (`nitroping`) is unchanged. See the [top-level README](../README.md) for SDKs in other languages.

<p align="center">
  <br>
  <b style="font-size: 2em;">nitroping-python</b>
  <br><br>
  Zero-dependency Python SDK for <a href="https://nitroping.dev">nitroping</a>.
  <br>
  Send push notifications, register devices, verify webhooks. Pure stdlib, runs on Python 3.10+.
  <br><br>
  <a href="https://pypi.org/project/nitroping/"><img src="https://img.shields.io/pypi/v/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="PyPI version"></a>
  <a href="https://pypi.org/project/nitroping/"><img src="https://img.shields.io/pypi/pyversions/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="Python versions"></a>
  <a href="https://pypi.org/project/nitroping/"><img src="https://img.shields.io/pypi/dm/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="PyPI downloads"></a>
  <a href="https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/nitroping-sdk?style=flat&colorA=18181B&colorB=34d399" alt="license"></a>
</p>

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your app
with one HTTP call. The service handles fanout, retries, idempotency, quota
and outbound webhooks for delivery state — you write the product, not the
plumbing.

`nitroping` (Python) is the official Python client. It has **zero runtime
dependencies**, ships type stubs (PEP 561), and runs anywhere CPython 3.10+
runs: Django, FastAPI, Flask, Celery workers, AWS Lambda, plain scripts. The
package weighs in under 30 kB.

## Install

```sh
pip install nitroping
# or
uv pip install nitroping
# or
poetry add nitroping
```

## Quick Start

### Send a notification

```python
import os
from nitroping import Nitroping

np = Nitroping(api_key=os.environ["NITROPING_API_KEY"])

result = np.notifications.send(
    title="Order #4129 shipped",
    body="Your package is on its way.",
    deep_link="https://example.com/orders/4129",
    actions=[
        {"id": "track", "title": "Track"},
        {"id": "view", "title": "View order"},
    ],
    target={"user_ids": ["user-42"]},
    idempotency_key="order-shipped-4129",
)

print(result["id"], result["status"])  # "abc-...", "queued"
```

### Register a device (server side)

```python
np.devices.register(
    platform="ios",
    token=device_token,           # raw APNs hex token
    user_id="user-42",
    metadata={"app_version": "2.4.1"},
)
```

### Verify a webhook

```python
import os
from nitroping.webhooks import verify
from nitroping.errors import (
    InvalidSignatureError,
    TimestampOutOfRangeError,
    MissingSignatureHeaderError,
)

def handle_webhook(raw_body: bytes, signature_header: str | None) -> None:
    try:
        event = verify(
            body=raw_body,
            signature=signature_header,
            secret=os.environ["NITROPING_WEBHOOK_SECRET"],
        )
    except (InvalidSignatureError, TimestampOutOfRangeError, MissingSignatureHeaderError):
        # Reject with HTTP 400 — do NOT leak which check failed.
        raise

    if event["type"] == "notification.delivered":
        print("delivered", event["data"]["notification_id"])
```

## Sync and async

`Nitroping` is synchronous and uses only the stdlib (`urllib.request`).

`AsyncNitroping` exposes the same API as coroutines. It wraps the sync
client and runs each call on the default executor via
`asyncio.get_running_loop().run_in_executor(None, ...)`. This is a
**best-effort wrapper** — it keeps the SDK zero-dependency and lets you
`await` from FastAPI / aiohttp / Starlette without surprises, but it is not
true non-blocking I/O. For high-fanout workloads (thousands of concurrent
sends) bring your own async HTTP client and call the API directly.

```python
import asyncio
from nitroping import AsyncNitroping

async def main() -> None:
    np = AsyncNitroping(api_key="np_live_...")
    result = await np.notifications.send(
        title="Hello",
        body="World",
        target={"all": True},
    )
    print(result)

asyncio.run(main())
```

## API reference

### `Nitroping(api_key=None, *, base_url=..., timeout=30.0, user_agent=None)`

Creates a synchronous server-side client. `api_key` falls back to the
`NITROPING_API_KEY` environment variable when omitted.

| Argument     | Default                    | Notes                                 |
| ------------ | -------------------------- | ------------------------------------- |
| `api_key`    | `$NITROPING_API_KEY`       | Secret key, format `np_...`.          |
| `base_url`   | `"https://nitroping.dev"`  | Override for self-hosted / staging.   |
| `timeout`    | `30.0` seconds             | Per-request socket timeout.           |
| `user_agent` | `"nitroping-python/0.1.0"` | Sent on every request.                |

### `np.notifications.send(*, target, title=None, body=None, ..., idempotency_key=None)`

Enqueues a notification. Returns `{"id": str, "status": str}` (`NotificationResult`).
Raises `ApiError` on non-2xx, carrying the server's `code`, `message`, and
per-field `details`.

```python
np.notifications.send(
    title="Welcome!",
    body="Glad to have you on board.",
    icon="https://example.com/icon.png",
    image="https://example.com/hero.png",
    deep_link="https://example.com/welcome",
    data={"onboarding": True},
    actions=[{"id": "tour", "title": "Take the tour"}],
    target={"all": True},
    idempotency_key="welcome-user-42",
)
```

`target` is one of three shapes (exactly one):

| Selector                       | Use when                         |
| ------------------------------ | -------------------------------- |
| `{"all": True}`                | Broadcast to every active device |
| `{"device_ids": [...]}`        | Hit specific device rows         |
| `{"user_ids": [...]}`          | Hit every device row a user owns |

### `np.notifications.get(notification_id)`

Fetches a previously enqueued notification by id. Returns the full row
(including counters: `total_sent`, `total_delivered`, `total_failed`, etc.).

### `np.devices.register(*, platform, token, user_id=None, ...)`

Registers (or updates) a device with the **secret** API key. Use this for
iOS / Android where you control the server. Returns `{"id": str,
"created": bool}` — `created` is `False` when an existing row matched on
`(app_id, token, user_id)`.

```python
np.devices.register(
    platform="ios",
    token="apns-hex-token",
    user_id="user-42",
    metadata={"app_version": "2.4.1"},
)
```

For Web Push, also pass `web_push_p256dh` and `web_push_auth` from the
browser's `PushSubscription`.

### `np.devices.deactivate(device_id)`

Soft-deletes a device (`status = "inactive"`). Subsequent sends skip it.

### `verify(*, body, signature, secret, tolerance=300, now=None)` — `nitroping.webhooks`

Verifies the `X-Nitroping-Signature` header and returns the parsed event.

```python
from nitroping.webhooks import verify

event = verify(
    body=raw_body_bytes,
    signature=request.headers.get("x-nitroping-signature"),
    secret=os.environ["NITROPING_WEBHOOK_SECRET"],
    tolerance=300,  # optional, seconds. Default 300.
)
```

The signing scheme is HMAC-SHA256 over `"<unix>.<raw body>"`. The header
ships as `t=<unix>, v1=<hex>` — same as Polar / Stripe. Use the raw
request body bytes (not a re-serialized parsed dict) or the HMAC won't
match.

## Framework recipes

### FastAPI

```python
from fastapi import FastAPI, Header, HTTPException, Request
from nitroping import Nitroping
from nitroping.errors import (
    InvalidSignatureError,
    MissingSignatureHeaderError,
    TimestampOutOfRangeError,
)
from nitroping.webhooks import verify
import os

app = FastAPI()
np = Nitroping(api_key=os.environ["NITROPING_API_KEY"])

@app.post("/notify")
def notify(title: str, body: str) -> dict[str, str]:
    return np.notifications.send(
        title=title, body=body, target={"all": True}
    )

@app.post("/webhooks/nitroping")
async def webhook(
    request: Request,
    x_nitroping_signature: str | None = Header(default=None),
) -> dict[str, str]:
    raw = await request.body()
    try:
        event = verify(
            body=raw,
            signature=x_nitroping_signature,
            secret=os.environ["NITROPING_WEBHOOK_SECRET"],
        )
    except (
        InvalidSignatureError,
        MissingSignatureHeaderError,
        TimestampOutOfRangeError,
    ):
        raise HTTPException(status_code=400, detail="bad signature")
    return {"received": event["id"]}
```

### Django

```python
# settings.py
NITROPING_API_KEY = os.environ["NITROPING_API_KEY"]
NITROPING_WEBHOOK_SECRET = os.environ["NITROPING_WEBHOOK_SECRET"]

# views.py
from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from nitroping import Nitroping
from nitroping.errors import (
    InvalidSignatureError,
    MissingSignatureHeaderError,
    TimestampOutOfRangeError,
)
from nitroping.webhooks import verify

np = Nitroping(api_key=settings.NITROPING_API_KEY)

@csrf_exempt
@require_POST
def nitroping_webhook(request: HttpRequest) -> HttpResponse:
    try:
        event = verify(
            body=request.body,
            signature=request.headers.get("X-Nitroping-Signature"),
            secret=settings.NITROPING_WEBHOOK_SECRET,
        )
    except (
        InvalidSignatureError,
        MissingSignatureHeaderError,
        TimestampOutOfRangeError,
    ):
        return HttpResponseBadRequest("bad signature")
    # ...handle event...
    return JsonResponse({"received": event["id"]})
```

### Flask

```python
import os
from flask import Flask, abort, jsonify, request
from nitroping.errors import (
    InvalidSignatureError,
    MissingSignatureHeaderError,
    TimestampOutOfRangeError,
)
from nitroping.webhooks import verify

app = Flask(__name__)

@app.post("/webhooks/nitroping")
def nitroping_webhook():
    try:
        event = verify(
            body=request.get_data(),  # bytes — do NOT use request.json
            signature=request.headers.get("X-Nitroping-Signature"),
            secret=os.environ["NITROPING_WEBHOOK_SECRET"],
        )
    except (
        InvalidSignatureError,
        MissingSignatureHeaderError,
        TimestampOutOfRangeError,
    ):
        abort(400)
    return jsonify(received=event["id"])
```

## Errors

Every error raised by the SDK extends `NitropingError`. Narrow by
`isinstance` to handle specific cases:

| Class                          | When it fires                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `NitropingError`               | Base class for every SDK error. Catch this to handle everything.                           |
| `ApiError`                     | The server returned a non-2xx response. Has `status`, `code`, `details`.                   |
| `NetworkError`                 | DNS / TLS / offline / timeout — the request never reached the server. Cause attached.      |
| `InvalidSignatureError`        | `verify()` HMAC mismatch or malformed header.                                              |
| `TimestampOutOfRangeError`     | `verify()` signature valid but `t=` outside the tolerance window.                          |
| `MissingSignatureHeaderError`  | `verify()` called with `signature=None`.                                                   |

```python
from nitroping import Nitroping
from nitroping.errors import ApiError, NetworkError

np = Nitroping()  # reads NITROPING_API_KEY

try:
    np.notifications.send(title="Hi", body="There", target={"all": True})
except NetworkError:
    # transient — retry with backoff
    ...
except ApiError as err:
    if err.code == "quota_exceeded":
        print(err.details)  # {"quota": ..., "used": ..., "resets_at": ...}
    else:
        raise
```

## Type hints

The package ships `py.typed` (PEP 561) — `mypy`, `pyright`, and `ruff` see
the public surface as fully typed. Every request shape is a `TypedDict`:

```python
from nitroping import NotificationResult, RegisterDeviceResult, WebhookEvent
```

## Runtime support

| Runtime        | Status |
| -------------- | ------ |
| CPython 3.10   | Yes    |
| CPython 3.11   | Yes    |
| CPython 3.12   | Yes    |
| CPython 3.13   | Yes    |
| PyPy 3.10+     | Should work (untested in CI). No C extensions. |

## License

[MIT](../LICENSE) — Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
