# nitroping-php

> This package is part of the [**nitroping-sdk**](https://github.com/productdevbook/nitroping-sdk) monorepo.
> The Packagist name (`productdevbook/nitroping`) is unchanged. See the [top-level README](../README.md) for SDKs in other languages.

<p align="center">
  <br>
  <b style="font-size: 2em;">nitroping-php</b>
  <br><br>
  Zero-dependency PHP SDK for <a href="https://nitroping.dev">nitroping</a>.
  <br>
  Send push notifications, register devices, verify webhooks. PHP 8.2+, strict types, PHPStan level 9.
  <br><br>
  <a href="https://packagist.org/packages/productdevbook/nitroping"><img src="https://img.shields.io/packagist/v/productdevbook/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="packagist version"></a>
  <a href="https://packagist.org/packages/productdevbook/nitroping"><img src="https://img.shields.io/packagist/dm/productdevbook/nitroping?style=flat&colorA=18181B&colorB=34d399" alt="packagist downloads"></a>
  <a href="https://packagist.org/packages/productdevbook/nitroping"><img src="https://img.shields.io/packagist/dependency-v/productdevbook/nitroping/php?style=flat&colorA=18181B&colorB=34d399" alt="php version"></a>
  <a href="https://github.com/productdevbook/nitroping-sdk/blob/main/LICENSE"><img src="https://img.shields.io/github/license/productdevbook/nitroping-sdk?style=flat&colorA=18181B&colorB=34d399" alt="license"></a>
</p>

## Why nitroping?

[nitroping](https://nitroping.dev) is a hosted push notification service that
unifies APNs (iOS), FCM (Android), and Web Push behind one API. Send to a
single device, a user across all of their devices, or every device in your
app with one HTTP call. The service handles fanout, retries, idempotency,
quota and outbound webhooks for delivery state — you write the product,
not the plumbing.

`nitroping-php` is the official PHP client. It has **zero composer
dependencies** — only the `curl`, `json`, and `hash` extensions, all of
which are bundled with every common PHP build. It uses `declare(strict_types=1)`
across the board, readonly properties, constructor promotion, and is clean
under PHPStan level 9.

## Install

```sh
composer require productdevbook/nitroping
```

Requires **PHP 8.2+** and the `ext-curl`, `ext-json`, `ext-hash` extensions
(present on every typical PHP install).

## Quick Start

### Send a notification

```php
<?php

use Productdevbook\Nitroping\Nitroping;

$np = new Nitroping(apiKey: getenv('NITROPING_API_KEY') ?: '');

$result = $np->notifications->send(
    title: 'Order #4129 shipped',
    body: 'On its way',
    deepLink: 'https://example.com/orders/4129',
    actions: [
        ['id' => 'track', 'title' => 'Track'],
        ['id' => 'view',  'title' => 'View order'],
    ],
    target: ['userIds' => ['user-42']],
    idempotencyKey: 'order-shipped-4129',
);

echo $result->id, ' ', $result->status; // "abc-...", "queued"
```

### Register a device

```php
<?php

use Productdevbook\Nitroping\Nitroping;

$np = new Nitroping(apiKey: getenv('NITROPING_API_KEY') ?: '');

$device = $np->devices->register(
    platform: 'ios',
    token: $rawApnsHexToken,
    userId: 'user-42',
    metadata: ['app_version' => '2.4.1'],
);

// $device is array{id: string, created: bool}
```

### Verify a webhook

```php
<?php

use Productdevbook\Nitroping\Webhooks;
use Productdevbook\Nitroping\Exceptions\InvalidSignatureException;
use Productdevbook\Nitroping\Exceptions\TimestampOutOfRangeException;
use Productdevbook\Nitroping\Exceptions\MissingSignatureHeaderException;

$body = file_get_contents('php://input') ?: '';

try {
    $event = Webhooks::verify(
        body: $body,
        signature: $_SERVER['HTTP_X_NITROPING_SIGNATURE'] ?? null,
        secret: getenv('NITROPING_WEBHOOK_SECRET') ?: '',
        tolerance: 300,
    );

    if ($event->type === 'notification.delivered') {
        // $event->data['notification_id'] ...
    }
} catch (
    MissingSignatureHeaderException
    | InvalidSignatureException
    | TimestampOutOfRangeException $e
) {
    http_response_code(400);
    echo 'bad signature';
    return;
}

http_response_code(200);
echo 'ok';
```

> Always pass the **raw** request body — never `json_decode(...)` and
> `json_encode(...)` it again. The HMAC is computed over the exact bytes
> the server sent, so any re-serialization (whitespace, key order, slash
> escaping) breaks the signature.

## API reference

### `new Nitroping(...)`

```php
new Nitroping(
    apiKey:         ?string $apiKey = null,            // or NITROPING_API_KEY env
    baseUrl:        string  $baseUrl = 'https://nitroping.dev',
    timeoutSeconds: int     $timeoutSeconds = 30,
    transport:      ?HttpTransport $transport = null,  // for tests / DI
)
```

Throws `NitropingException` (code `invalid_argument`) when no `apiKey` is
provided and `NITROPING_API_KEY` is unset.

#### `$np->notifications->send(...): NotificationResult`

```php
$np->notifications->send(
    target:         array    $target,           // ['all'=>true] | ['deviceIds'=>[...]] | ['userIds'=>[...]]
    title:          ?string  $title          = null,
    body:           ?string  $body           = null,
    template:       ?string  $template       = null,   // Pro tier
    vars:           ?array   $vars           = null,
    data:           ?array   $data           = null,
    icon:           ?string  $icon           = null,
    image:          ?string  $image          = null,
    clickAction:    ?string  $clickAction    = null,
    deepLink:       ?string  $deepLink       = null,
    actions:        ?array   $actions        = null,   // [['id'=>..., 'title'=>..., 'icon'=>?]]
    scheduledAt:    ?string  $scheduledAt    = null,   // ISO-8601
    expiresAt:      ?string  $expiresAt      = null,   // ISO-8601
    idempotencyKey: ?string  $idempotencyKey = null,
): NotificationResult
```

`target` is the only required parameter. Pick exactly one selector:

| Selector                       | Use when                         |
| ------------------------------ | -------------------------------- |
| `['all' => true]`              | Broadcast to every active device |
| `['deviceIds' => ['d1','d2']]` | Hit specific device rows         |
| `['userIds' => ['u1','u2']]`   | Hit every device row a user owns |

Returns a `NotificationResult { id: string, status: string }`. Throws
`ApiException` on non-2xx with the server's stable `code`, `message`, and
field-level `details` (for `validation_failed`).

#### `$np->notifications->get(string $id): array`

Fetch a previously-enqueued notification by id. Returns the raw server
row (`counters`, `total_sent`, etc.).

#### `$np->devices->register(...): array`

```php
$np->devices->register(
    platform:      string  $platform,           // 'ios' | 'android' | 'web'
    token:         string  $token,
    userId:        ?string $userId        = null,
    webPushP256dh: ?string $webPushP256dh = null, // required for web
    webPushAuth:   ?string $webPushAuth   = null, // required for web
    metadata:      ?array  $metadata      = null,
): array
```

Returns `['id' => string, 'created' => bool]`.

#### `$np->devices->deactivate(string $deviceId): array`

Sets `status = inactive`. Returns `['id' => string, 'status' => 'inactive']`.
Throws `ApiException` with `errorCode: "not_found"` on 404.

#### `$np->events->record(...): array`

Report delivery telemetry. Most users won't need this — the server emits
delivery events automatically for APNs/FCM; this is for client-side
opened / clicked feedback or custom transports.

```php
$np->events->record(
    type:           string  $type,             // 'notification.delivered' | '.opened' | '.clicked' | '.failed'
    notificationId: string  $notificationId,
    deviceId:       ?string $deviceId = null,
    data:           ?array  $data     = null,
);
```

### `Webhooks::verify(...): WebhookEvent`

```php
use Productdevbook\Nitroping\Webhooks;

$event = Webhooks::verify(
    body:      string             $body,        // raw bytes
    signature: string|array|null  $signature,   // value of X-Nitroping-Signature
    secret:    string             $secret,
    tolerance: int                $tolerance = 300, // seconds
    now:       ?int               $now       = null, // override for tests
);
```

Signing scheme: HMAC-SHA256 over `"<unix>.<raw body>"`, header is
`t=<unix>, v1=<hex>`. Same shape as Polar / Stripe.

### `Webhooks::sign(string $secret, string $body, ?int $timestamp = null): string`

Compute a header value. Mostly useful for tests.

## Framework recipes

### Laravel route handler

```php
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Webhooks;
use Productdevbook\Nitroping\Exceptions\NitropingException;
use Illuminate\Http\Request;

Route::post('/send', function (Request $request) {
    $np = new Nitroping(apiKey: config('services.nitroping.api_key'));

    $result = $np->notifications->send(
        title: $request->string('title'),
        body: $request->string('body'),
        target: ['all' => true],
    );

    return response()->json([
        'id' => $result->id,
        'status' => $result->status,
    ]);
});

Route::post('/webhooks/nitroping', function (Request $request) {
    try {
        $event = Webhooks::verify(
            body: $request->getContent(),
            signature: $request->header('X-Nitroping-Signature'),
            secret: config('services.nitroping.webhook_secret'),
        );
    } catch (NitropingException $e) {
        return response('bad signature', 400);
    }

    // ...handle $event...

    return response('ok');
});
```

### Symfony controller

```php
namespace App\Controller;

use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Webhooks;
use Productdevbook\Nitroping\Exceptions\NitropingException;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

class NitropingController extends AbstractController
{
    #[Route('/webhooks/nitroping', methods: ['POST'])]
    public function webhook(Request $request): Response
    {
        try {
            $event = Webhooks::verify(
                body: $request->getContent(),
                signature: $request->headers->get('X-Nitroping-Signature'),
                secret: $_ENV['NITROPING_WEBHOOK_SECRET'] ?? '',
            );
        } catch (NitropingException) {
            return new Response('bad signature', 400);
        }

        // ...handle $event...

        return new Response('ok');
    }
}
```

### Raw PHP webhook receiver

```php
<?php

require __DIR__ . '/vendor/autoload.php';

use Productdevbook\Nitroping\Webhooks;
use Productdevbook\Nitroping\Exceptions\NitropingException;

$body = file_get_contents('php://input') ?: '';

try {
    $event = Webhooks::verify(
        body: $body,
        signature: $_SERVER['HTTP_X_NITROPING_SIGNATURE'] ?? null,
        secret: getenv('NITROPING_WEBHOOK_SECRET') ?: '',
    );
} catch (NitropingException $e) {
    http_response_code(400);
    echo $e->errorCode;
    exit;
}

// $event->type, $event->data, ...

http_response_code(200);
echo 'ok';
```

## Errors

Every exception thrown by the SDK extends `NitropingException` (which itself
extends `\RuntimeException`). Narrow with `instanceof` to handle specific
cases.

| Class                              | When it fires                                                        |
| ---------------------------------- | -------------------------------------------------------------------- |
| `NitropingException`               | Base class. Configuration / parse errors with no more specific code. |
| `ApiException`                     | Non-2xx server response. Has `status`, `errorCode`, `details`.       |
| `NetworkException`                 | Transport-level failure (DNS, TLS, timeout, connection reset).       |
| `InvalidSignatureException`        | Webhook HMAC mismatch or malformed header.                           |
| `TimestampOutOfRangeException`     | Webhook signature valid but `t=` outside the tolerance window.       |
| `MissingSignatureHeaderException`  | Webhook had no `X-Nitroping-Signature` header.                       |

```php
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Exceptions\NetworkException;

try {
    $np->notifications->send(title: 'Hi', body: 'There', target: ['all' => true]);
} catch (NetworkException $e) {
    // transient — retry with backoff
} catch (ApiException $e) {
    if ($e->errorCode === 'quota_exceeded') {
        // surface "upgrade your plan" UI; $e->details is ['quota', 'used', 'resets_at']
    } else {
        throw $e;
    }
}
```

## Testing your code

Inject a custom `HttpTransport` to avoid touching the network in unit tests:

```php
use Productdevbook\Nitroping\Internal\HttpTransport;
use Productdevbook\Nitroping\Nitroping;

final class FakeTransport implements HttpTransport
{
    public array $calls = [];

    public function request(string $method, string $path, array $headers = [], ?array $body = null): array
    {
        $this->calls[] = compact('method', 'path', 'headers', 'body');
        return ['id' => 'fake-id', 'status' => 'queued'];
    }
}

$transport = new FakeTransport();
$np = new Nitroping(apiKey: 'np_test', transport: $transport);

$np->notifications->send(title: 'Hi', body: 'x', target: ['all' => true]);
assert($transport->calls[0]['path'] === '/api/v1/notifications');
```

## Development

```sh
composer install
composer test       # phpunit
composer analyse    # phpstan level 9
composer fix        # php-cs-fixer
```

Tested against PHP 8.2, 8.3, and 8.4 in CI.

## License

[MIT](../LICENSE) — Copyright (c) 2026 productdevbook.

---

<p align="center">
  <sub>
    Built by <a href="https://github.com/productdevbook">@productdevbook</a> — <a href="https://nitroping.dev">nitroping.dev</a> · <a href="https://github.com/productdevbook/nitroping">OSS core</a>
  </sub>
</p>
