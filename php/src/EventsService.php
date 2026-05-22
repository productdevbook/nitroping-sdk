<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `events` resource — mounted on {@see Nitroping} as `$np->events`.
 *
 * Wraps `POST /api/v1/events` — used by clients (and server-side
 * code) to report delivery / open / click telemetry back to the
 * nitroping server.
 */
final class EventsService
{
    public function __construct(private readonly HttpTransport $transport)
    {
    }

    /**
     * Record an event for a previously-sent notification.
     *
     * `type` is one of the server-recognized event types:
     *   - `"notification.delivered"`
     *   - `"notification.opened"`
     *   - `"notification.clicked"`
     *   - `"notification.failed"`
     *
     * `data` is an optional event-specific payload — for example
     * `['action_id' => 'track']` on a clicked event, or
     * `['reason' => 'permission_denied']` on a failed event.
     *
     * @param array<string, mixed>|null $data
     *
     * @return array<string, mixed>
     */
    public function record(
        string $type,
        string $notificationId,
        ?string $deviceId = null,
        ?array $data = null,
    ): array {
        $payload = [
            'type' => $type,
            'notification_id' => $notificationId,
        ];
        if ($deviceId !== null) {
            $payload['device_id'] = $deviceId;
        }
        if ($data !== null) {
            $payload['data'] = $data;
        }

        return $this->transport->request(
            method: 'POST',
            path: '/api/v1/events',
            body: $payload,
        );
    }
}
