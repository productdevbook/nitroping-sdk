<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `devices` resource — mounted on {@see Nitroping} as `$np->devices`.
 *
 * Wraps `GET /api/v1/devices`, `POST /api/v1/devices`,
 * `PUT /api/v1/devices/:id`, `DELETE /api/v1/devices/:id`,
 * `DELETE /api/v1/devices` (by token), and the public
 * `GET /api/v1/public/apps/:id/vapid` key lookup.
 */
final class DevicesService
{
    public function __construct(private readonly HttpTransport $transport)
    {
    }

    /**
     * Register (or update) a device with the secret API key.
     *
     * Idempotent on `(app_id, token, user_id)`. Returns the raw server
     * response — typically `['id' => '...', 'created' => bool]`. `created`
     * is `true` if a new row was inserted, `false` if an existing
     * device matched.
     *
     * `platform` must be one of `'ios'`, `'android'`, `'web'`.
     *
     * For Web Push devices, pass `webPushP256dh` and `webPushAuth`
     * (extracted from `PushSubscription.getKey('p256dh' | 'auth')` in the
     * browser).
     *
     * Pass `tags` to attach tag-based targeting labels at registration
     * time (the server replaces the device's tag set with the supplied
     * list).
     *
     * Pass `environment` (`'sandbox'` or `'production'`) for iOS devices —
     * the APNs host is environment-specific and a token can't reveal which,
     * so it must be reported. Ignored for non-iOS platforms.
     *
     * Pass `timezone` (an IANA timezone, e.g. `'Europe/Istanbul'`) to enable
     * quiet-hours delivery — sends inside the app's quiet window are deferred
     * to the window's end in the device's local time.
     *
     * @param array<string, mixed>|null $metadata
     * @param list<string>|null         $tags
     *
     * @return array<string, mixed>
     */
    public function register(
        string $platform,
        string $token,
        ?string $userId = null,
        ?string $webPushP256dh = null,
        ?string $webPushAuth = null,
        ?array $metadata = null,
        ?array $tags = null,
        ?string $environment = null,
        ?string $timezone = null,
    ): array {
        $payload = [
            'platform' => $platform,
            'token' => $token,
        ];
        if ($userId !== null) {
            $payload['user_id'] = $userId;
        }
        if ($webPushP256dh !== null) {
            $payload['web_push_p256dh'] = $webPushP256dh;
        }
        if ($webPushAuth !== null) {
            $payload['web_push_auth'] = $webPushAuth;
        }
        if ($metadata !== null) {
            $payload['metadata'] = $metadata;
        }
        if ($tags !== null) {
            $payload['tags'] = $tags;
        }
        if ($environment !== null) {
            $payload['environment'] = $environment;
        }
        if ($timezone !== null) {
            $payload['timezone'] = $timezone;
        }

        $isPublic = $this->transport instanceof \Productdevbook\Nitroping\Internal\CurlTransport
            && $this->transport->resolvedAuthScheme === 'Public';
        $path = $isPublic ? '/api/v1/public/devices' : '/api/v1/devices';

        return $this->transport->request(
            method: 'POST',
            path: $path,
            body: $payload,
        );
    }

    /**
     * List devices for your app (secret API key only).
     *
     * Wraps `GET /api/v1/devices`. Every filter is optional; pass `userId`
     * to fetch a single end-user's registered devices. The push token is
     * **never** returned in the listing.
     *
     * `platform` filters by `'ios'`, `'android'`, or `'web'`; `status`
     * filters by `'active'` or `'inactive'`. `page` is 1-based and
     * `pageSize` is rows-per-page (the server caps it at 100).
     *
     * Returns the camelCased listing:
     *
     * ```php
     * [
     *     'data' => [
     *         [
     *             'id' => string,
     *             'userId' => ?string,
     *             'platform' => 'ios'|'android'|'web',
     *             'status' => 'active'|'inactive',
     *             'tags' => list<string>,
     *             'timezone' => ?string,
     *             'apnsEnvironment' => 'sandbox'|'production'|null,
     *             'lastSeenAt' => ?string,
     *             'insertedAt' => string,
     *         ],
     *         // ...
     *     ],
     *     'total' => int,
     * ]
     * ```
     *
     * @return array{data: list<array<string, mixed>>, total: int}
     */
    public function list(
        ?string $userId = null,
        ?string $platform = null,
        ?string $status = null,
        ?int $page = null,
        ?int $pageSize = null,
    ): array {
        $query = [];
        if ($userId !== null) {
            $query['user_id'] = $userId;
        }
        if ($platform !== null) {
            $query['platform'] = $platform;
        }
        if ($status !== null) {
            $query['status'] = $status;
        }
        if ($page !== null) {
            $query['page'] = (string) $page;
        }
        if ($pageSize !== null) {
            $query['page_size'] = (string) $pageSize;
        }

        $path = '/api/v1/devices';
        if ($query !== []) {
            $path .= '?' . http_build_query($query);
        }

        $raw = $this->transport->request(
            method: 'GET',
            path: $path,
        );

        $rows = (isset($raw['data']) && is_array($raw['data'])) ? $raw['data'] : [];
        $data = [];
        foreach ($rows as $row) {
            if (is_array($row)) {
                /** @var array<string, mixed> $row */
                $data[] = self::deviceFromWire($row);
            }
        }

        return [
            'data' => $data,
            'total' => is_int($raw['total'] ?? null) ? $raw['total'] : count($data),
        ];
    }

    /**
     * Deactivate a device (soft delete — sets `status = inactive`).
     *
     * Returns `['id' => string, 'status' => 'inactive']`. Throws an
     * {@see \Productdevbook\Nitroping\Exceptions\ApiException} with
     * `code: "not_found"` if the id doesn't belong to your app.
     *
     * @return array<string, mixed>
     */
    public function deactivate(string $deviceId): array
    {
        return $this->transport->request(
            method: 'DELETE',
            path: '/api/v1/devices/' . rawurlencode($deviceId),
        );
    }

    /**
     * Deactivate a device by its provider token (logout flow — you know the
     * token but not the device id).
     *
     * Wraps `DELETE /api/v1/devices` with a `['token' => ...]` JSON body (no
     * id in the path). Returns `['id' => string, 'status' => 'inactive']`.
     * Throws an {@see \Productdevbook\Nitroping\Exceptions\ApiException} with
     * `code: "not_found"` when no device with that token belongs to your app.
     *
     * @return array<string, mixed>
     */
    public function deactivateByToken(string $token): array
    {
        return $this->transport->request(
            method: 'DELETE',
            path: '/api/v1/devices',
            body: ['token' => $token],
        );
    }

    /**
     * Update a device — currently used to replace its tag set.
     *
     * Sends `PUT /api/v1/devices/:id` with `['tags' => [...]]`. Returns
     * `['id' => string, 'tags' => list<string>]`. Throws an
     * {@see \Productdevbook\Nitroping\Exceptions\ApiException} with
     * `code: "not_found"` if the id doesn't belong to your app.
     *
     * @param list<string> $tags the device's complete, replacement tag set
     *
     * @return array<string, mixed>
     */
    public function update(string $deviceId, array $tags): array
    {
        return $this->transport->request(
            method: 'PUT',
            path: '/api/v1/devices/' . rawurlencode($deviceId),
            body: ['tags' => $tags],
        );
    }

    /**
     * Fetch an app's public VAPID key for Web Push subscription.
     *
     * Hits the unauthenticated `GET /api/v1/public/apps/:id/vapid`
     * endpoint and returns the raw response — typically
     * `['public_key' => string]`.
     *
     * @return array<string, mixed>
     */
    public function fetchVapidPublicKey(string $appId): array
    {
        return $this->transport->request(
            method: 'GET',
            path: '/api/v1/public/apps/' . rawurlencode($appId) . '/vapid',
        );
    }

    /**
     * Translate one snake_case device summary row from the wire into the
     * camelCase shape the SDK exposes. The push token is never present.
     *
     * @param array<string, mixed> $row
     *
     * @return array<string, mixed>
     */
    private static function deviceFromWire(array $row): array
    {
        return [
            'id' => $row['id'] ?? null,
            'userId' => $row['user_id'] ?? null,
            'platform' => $row['platform'] ?? null,
            'status' => $row['status'] ?? null,
            'tags' => $row['tags'] ?? [],
            'timezone' => $row['timezone'] ?? null,
            'apnsEnvironment' => $row['apns_environment'] ?? null,
            'lastSeenAt' => $row['last_seen_at'] ?? null,
            'insertedAt' => $row['inserted_at'] ?? null,
        ];
    }
}
