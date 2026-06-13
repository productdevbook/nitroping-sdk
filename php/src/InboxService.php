<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `inbox` resource — mounted on {@see Nitroping} as `$np->inbox`.
 *
 * Wraps the in-app notification center under `/api/v1/public/inbox`. These
 * endpoints authenticate with a **public** (`pk_`) key — they're meant to be
 * called from a client app on behalf of a signed-in end user, identified by
 * `$userId` (the same opaque id you pass at device registration).
 */
final class InboxService
{
    public function __construct(private readonly HttpTransport $transport)
    {
    }

    /**
     * List a user's inbox, newest first.
     *
     * Returns the raw `items` array — a list of inbox-item maps shaped like
     * `['id' => string, 'notification_id' => string, 'title' => ?string,
     *   'body' => ?string, 'data' => ?array, 'deep_link' => ?string,
     *   'read' => bool, 'read_at' => ?string, 'inserted_at' => ?string]`.
     *
     * @return list<array<string, mixed>>
     */
    public function list(string $userId, ?bool $unreadOnly = null, ?int $limit = null): array
    {
        $query = ['user_id' => $userId];
        if ($unreadOnly !== null) {
            $query['unread_only'] = $unreadOnly ? 'true' : 'false';
        }
        if ($limit !== null) {
            $query['limit'] = (string) $limit;
        }

        $response = $this->transport->request(
            method: 'GET',
            path: self::withQuery('/api/v1/public/inbox', $query),
        );

        $items = $response['items'] ?? [];

        /** @var list<array<string, mixed>> $items */
        return is_array($items) ? $items : [];
    }

    /**
     * Count a user's unread inbox items.
     */
    public function unreadCount(string $userId): int
    {
        $response = $this->transport->request(
            method: 'GET',
            path: self::withQuery('/api/v1/public/inbox/unread_count', ['user_id' => $userId]),
        );

        $count = $response['unread_count'] ?? 0;

        return is_numeric($count) ? (int) $count : 0;
    }

    /**
     * Mark a single inbox item read.
     *
     * Returns the raw updated inbox-item map.
     *
     * @return array<string, mixed>
     */
    public function markRead(string $userId, string $itemId): array
    {
        return $this->transport->request(
            method: 'POST',
            path: '/api/v1/public/inbox/' . rawurlencode($itemId) . '/read',
            body: ['user_id' => $userId],
        );
    }

    /**
     * Mark every unread inbox item read for a user. Returns the count updated.
     */
    public function markAllRead(string $userId): int
    {
        $response = $this->transport->request(
            method: 'POST',
            path: '/api/v1/public/inbox/read_all',
            body: ['user_id' => $userId],
        );

        $marked = $response['marked_read'] ?? 0;

        return is_numeric($marked) ? (int) $marked : 0;
    }

    /**
     * Append a URL-encoded query string to a path.
     *
     * The transport speaks only `(method, path, headers, body)`, so query
     * params are folded into the path here.
     *
     * @param array<string, string> $query
     */
    private static function withQuery(string $path, array $query): string
    {
        if ($query === []) {
            return $path;
        }

        return $path . '?' . http_build_query($query);
    }
}
