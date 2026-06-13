<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Models;

/**
 * Strongly-typed wrapper around the `POST /api/v1/notifications` body.
 *
 * Optional sugar — the canonical entry point is the named-argument
 * `NotificationsService::send(...)`. Use this class when you'd rather
 * build a request value object up over several lines, store it, etc.
 *
 * `target` is a discriminated union expressed as an array shape:
 *
 *   - `['all' => true]`
 *   - `['deviceIds' => ['d1', 'd2']]` (camelCase, converted on the wire)
 *   - `['userIds'   => ['u1', 'u2']]`
 *   - `['tags'      => ['t1', 't2']]`
 *   - `['segment'   => ['match' => 'all'|'any', 'conditions' => [...]]]`
 */
final class SendRequest
{
    /**
     * @param array{
     *   all?: bool,
     *   deviceIds?: list<string>,
     *   userIds?: list<string>,
     *   tags?: list<string>,
     *   segment?: array{match?: string, conditions: list<array{field: string, op: string, value?: mixed}>},
     * } $target
     * @param list<array{id: string, title: string, icon?: string}>|null $actions
     * @param array<string, mixed>|null $vars
     * @param array<string, mixed>|null $data
     * @param list<string>|null         $emailTo
     */
    public function __construct(
        public readonly array $target,
        public readonly ?string $title = null,
        public readonly ?string $body = null,
        public readonly ?string $template = null,
        public readonly ?array $vars = null,
        public readonly ?array $data = null,
        public readonly ?string $icon = null,
        public readonly ?string $image = null,
        public readonly ?string $clickAction = null,
        public readonly ?string $deepLink = null,
        public readonly ?array $actions = null,
        public readonly ?string $scheduledAt = null,
        public readonly ?string $expiresAt = null,
        public readonly ?string $recurrence = null,
        public readonly ?string $recurrenceTz = null,
        public readonly ?string $recurrenceUntil = null,
        public readonly ?array $emailTo = null,
    ) {
    }
}
