<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `track` resource — mounted on {@see Nitroping} as `$np->track`.
 *
 * Wraps `POST /api/v1/track` — the server-side delivery/open/click
 * callback. The server returns `202 Accepted` immediately; the write is
 * absorbed by a background worker, so the response body is typically
 * `['accepted' => true]`.
 *
 * Field naming follows the JS SDK: SDK input is camelCase
 * (`deliveryLogId`, `notificationId`, `deviceToken`); wire format is
 * snake_case (`delivery_log_id`, `notification_id`, `device_token`).
 */
final class TrackService
{
    public function __construct(private readonly HttpTransport $transport)
    {
    }

    /**
     * Record a delivery/open/click event against a delivery log.
     *
     * `input` must identify the target in exactly one of two ways:
     *   - `['deliveryLogId' => string, 'event' => string]`
     *   - `['notificationId' => string, 'deviceToken' => string, 'event' => string]`
     *
     * `event` is one of `'delivered'`, `'opened'`, `'clicked'`.
     *
     * @param array{
     *   deliveryLogId?: string,
     *   notificationId?: string,
     *   deviceToken?: string,
     *   event: string,
     * } $input
     *
     * @return array<string, mixed>
     */
    public function record(array $input): array
    {
        return $this->transport->request(
            method: 'POST',
            path: '/api/v1/track',
            body: self::toWire($input),
        );
    }

    /**
     * Translate the camelCase SDK shape into the snake_case wire shape
     * the controller expects.
     *
     * @param array{
     *   deliveryLogId?: string,
     *   notificationId?: string,
     *   deviceToken?: string,
     *   event: string,
     * } $input
     *
     * @return array<string, mixed>
     */
    private static function toWire(array $input): array
    {
        if (array_key_exists('deliveryLogId', $input)) {
            return [
                'delivery_log_id' => $input['deliveryLogId'],
                'event' => $input['event'],
            ];
        }

        $wire = ['event' => $input['event']];
        if (array_key_exists('notificationId', $input)) {
            $wire['notification_id'] = $input['notificationId'];
        }
        if (array_key_exists('deviceToken', $input)) {
            $wire['device_token'] = $input['deviceToken'];
        }

        return $wire;
    }
}
