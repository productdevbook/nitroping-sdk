<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Internal\HttpTransport;
use Productdevbook\Nitroping\Models\NotificationResult;
use Productdevbook\Nitroping\Models\SendRequest;

/**
 * `notifications` resource — mounted on {@see Nitroping} as
 * `$np->notifications`.
 *
 * Wraps `POST /api/v1/notifications` (and `GET /api/v1/notifications/:id`).
 *
 * Field naming follows the JS SDK: SDK input is camelCase (`deepLink`,
 * `clickAction`, etc.), wire format is snake_case
 * (`deep_link`, `click_action`). The translation happens in {@see toWire}.
 */
final class NotificationsService
{
    public function __construct(private readonly HttpTransport $transport)
    {
    }

    /**
     * Enqueue a new notification.
     *
     * `target` must be exactly one of:
     *   - `['all' => true]`
     *   - `['deviceIds' => ['d1', 'd2', ...]]`
     *   - `['userIds'   => ['u1', 'u2', ...]]`
     *
     * `actions` is a list of `['id' => string, 'title' => string, 'icon' => ?string]`.
     *
     * Pass `idempotencyKey` to make retries safe: the server replays the
     * cached response for the same key + body for 24 hours. Same key
     * with a different body yields a 409 (`idempotency_conflict`).
     *
     * @param array{
     *   all?: bool,
     *   deviceIds?: list<string>,
     *   userIds?: list<string>,
     * } $target
     * @param list<array{id: string, title: string, icon?: string}>|null $actions
     * @param array<string, mixed>|null $vars
     * @param array<string, mixed>|null $data
     */
    public function send(
        array $target,
        ?string $title = null,
        ?string $body = null,
        ?string $template = null,
        ?array $vars = null,
        ?array $data = null,
        ?string $icon = null,
        ?string $image = null,
        ?string $clickAction = null,
        ?string $deepLink = null,
        ?array $actions = null,
        ?string $scheduledAt = null,
        ?string $expiresAt = null,
        ?string $idempotencyKey = null,
    ): NotificationResult {
        $payload = self::toWire(
            target: $target,
            title: $title,
            body: $body,
            template: $template,
            vars: $vars,
            data: $data,
            icon: $icon,
            image: $image,
            clickAction: $clickAction,
            deepLink: $deepLink,
            actions: $actions,
            scheduledAt: $scheduledAt,
            expiresAt: $expiresAt,
        );

        $headers = [];
        if ($idempotencyKey !== null) {
            $headers['Idempotency-Key'] = $idempotencyKey;
        }

        $response = $this->transport->request(
            method: 'POST',
            path: '/api/v1/notifications',
            headers: $headers,
            body: $payload,
        );

        return NotificationResult::fromArray($response);
    }

    /**
     * Convenience wrapper accepting a {@see SendRequest} value object.
     */
    public function sendRequest(SendRequest $req, ?string $idempotencyKey = null): NotificationResult
    {
        return $this->send(
            target: $req->target,
            title: $req->title,
            body: $req->body,
            template: $req->template,
            vars: $req->vars,
            data: $req->data,
            icon: $req->icon,
            image: $req->image,
            clickAction: $req->clickAction,
            deepLink: $req->deepLink,
            actions: $req->actions,
            scheduledAt: $req->scheduledAt,
            expiresAt: $req->expiresAt,
            idempotencyKey: $idempotencyKey,
        );
    }

    /**
     * Fetch a previously-enqueued notification by id.
     *
     * @return array<string, mixed>
     */
    public function get(string $id): array
    {
        return $this->transport->request(
            method: 'GET',
            path: '/api/v1/notifications/' . rawurlencode($id),
        );
    }

    /**
     * Translate the camelCase SDK shape into the snake_case wire shape
     * the Phoenix controller expects.
     *
     * @param array{
     *   all?: bool,
     *   deviceIds?: list<string>,
     *   userIds?: list<string>,
     * } $target
     * @param list<array{id: string, title: string, icon?: string}>|null $actions
     * @param array<string, mixed>|null $vars
     * @param array<string, mixed>|null $data
     *
     * @return array<string, mixed>
     */
    private static function toWire(
        array $target,
        ?string $title,
        ?string $body,
        ?string $template,
        ?array $vars,
        ?array $data,
        ?string $icon,
        ?string $image,
        ?string $clickAction,
        ?string $deepLink,
        ?array $actions,
        ?string $scheduledAt,
        ?string $expiresAt,
    ): array {
        $wire = [];
        if ($title !== null) {
            $wire['title'] = $title;
        }
        if ($body !== null) {
            $wire['body'] = $body;
        }
        if ($template !== null) {
            $wire['template'] = $template;
        }
        if ($vars !== null) {
            $wire['vars'] = $vars;
        }
        if ($data !== null) {
            $wire['data'] = $data;
        }
        if ($icon !== null) {
            $wire['icon'] = $icon;
        }
        if ($image !== null) {
            $wire['image'] = $image;
        }
        if ($clickAction !== null) {
            $wire['click_action'] = $clickAction;
        }
        if ($deepLink !== null) {
            $wire['deep_link'] = $deepLink;
        }
        if ($actions !== null) {
            $wire['actions'] = $actions;
        }
        if ($scheduledAt !== null) {
            $wire['scheduled_at'] = $scheduledAt;
        }
        if ($expiresAt !== null) {
            $wire['expires_at'] = $expiresAt;
        }
        $wire['target'] = self::targetToWire($target);

        return $wire;
    }

    /**
     * @param array{
     *   all?: bool,
     *   deviceIds?: list<string>,
     *   userIds?: list<string>,
     * } $target
     *
     * @return array<string, mixed>
     */
    private static function targetToWire(array $target): array
    {
        if (array_key_exists('all', $target)) {
            return ['all' => $target['all']];
        }
        if (array_key_exists('deviceIds', $target)) {
            return ['device_ids' => $target['deviceIds']];
        }
        if (array_key_exists('userIds', $target)) {
            return ['user_ids' => $target['userIds']];
        }

        // Unknown shape — pass through for forward compatibility.
        /** @var array<string, mixed> $target */
        return $target;
    }
}
