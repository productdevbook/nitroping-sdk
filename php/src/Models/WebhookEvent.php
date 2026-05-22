<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Models;

/**
 * Outbound webhook event envelope, returned by `Webhooks::verify`.
 *
 * Matches the structure built in `Nitroping.Webhooks.Outbound.dispatch/3`
 * on the server. `data` is the event-specific payload kept as a raw
 * associative array — branch on `$type` to interpret it.
 */
final class WebhookEvent
{
    /**
     * @param array<string, mixed> $data
     */
    public function __construct(
        public readonly string $id,
        public readonly string $type,
        public readonly string $createdAt,
        public readonly array $data,
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     */
    public static function fromArray(array $payload): self
    {
        $id = $payload['id'] ?? '';
        $type = $payload['type'] ?? '';
        $createdAt = $payload['created_at'] ?? '';
        $data = $payload['data'] ?? [];

        return new self(
            id: is_string($id) ? $id : '',
            type: is_string($type) ? $type : '',
            createdAt: is_string($createdAt) ? $createdAt : '',
            data: is_array($data) ? $data : [],
        );
    }
}
