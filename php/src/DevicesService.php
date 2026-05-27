<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `devices` resource — mounted on {@see Nitroping} as `$np->devices`.
 *
 * Wraps `POST /api/v1/devices` and `DELETE /api/v1/devices/:id`.
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
     * @param array<string, mixed>|null $metadata
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
}
