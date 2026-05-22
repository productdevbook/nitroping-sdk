<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Models;

/**
 * Result returned by `NotificationsService::send`.
 *
 * `id` is the UUID of the notification row. `status` is the initial
 * status set by the server, usually `"queued"`.
 */
final class NotificationResult
{
    public function __construct(
        public readonly string $id,
        public readonly string $status,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        $id = $payload['id'] ?? null;
        $status = $payload['status'] ?? null;

        return new self(
            id: is_string($id) ? $id : '',
            status: is_string($status) ? $status : '',
        );
    }
}
