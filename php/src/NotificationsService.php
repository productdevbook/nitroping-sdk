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
     *   - `['tags'      => ['t1', 't2', ...]]`
     *   - `['segment'   => ['match' => 'all'|'any', 'conditions' => [['field' => ..., 'op' => ..., 'value' => ...], ...]]]`
     *
     * `actions` is a list of `['id' => string, 'title' => string, 'icon' => ?string]`.
     *
     * Pass `idempotencyKey` to make retries safe: the server replays the
     * cached response for the same key + body for 24 hours. Same key
     * with a different body yields a 409 (`idempotency_conflict`).
     *
     * `recurrence` is a 5-field cron expression. When set, the notification
     * becomes a recurring series: the server clones a one-shot occurrence on
     * each tick (e.g. `"0 9 * * *"`). `recurrenceTz` is the IANA timezone the
     * cron is evaluated in (default `Etc/UTC`); `recurrenceUntil` is an
     * ISO-8601 timestamp after which the series stops.
     *
     * `emailTo` additionally delivers this notification as email to the given
     * addresses (title → subject, body → content).
     *
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
        ?string $recurrence = null,
        ?string $recurrenceTz = null,
        ?string $recurrenceUntil = null,
        ?array $emailTo = null,
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
            recurrence: $recurrence,
            recurrenceTz: $recurrenceTz,
            recurrenceUntil: $recurrenceUntil,
            emailTo: $emailTo,
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
            recurrence: $req->recurrence,
            recurrenceTz: $req->recurrenceTz,
            recurrenceUntil: $req->recurrenceUntil,
            emailTo: $req->emailTo,
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
     * Cancel a previously-enqueued notification.
     *
     * Returns `['id' => string, 'status' => 'canceled']`. Throws an
     * {@see \Productdevbook\Nitroping\Exceptions\ApiException} with
     * `code: "cannot_cancel"` (409) if the notification has already been
     * sent (or is otherwise past the point of no return), or
     * `code: "not_found"` if the id doesn't belong to your app.
     *
     * @return array<string, mixed>
     */
    public function cancel(string $id): array
    {
        return $this->transport->request(
            method: 'DELETE',
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
     *   tags?: list<string>,
     *   segment?: array{match?: string, conditions: list<array{field: string, op: string, value?: mixed}>},
     * } $target
     * @param list<array{id: string, title: string, icon?: string}>|null $actions
     * @param array<string, mixed>|null $vars
     * @param array<string, mixed>|null $data
     * @param list<string>|null         $emailTo
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
        ?string $recurrence,
        ?string $recurrenceTz,
        ?string $recurrenceUntil,
        ?array $emailTo,
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
        if ($recurrence !== null) {
            $wire['recurrence'] = $recurrence;
        }
        if ($recurrenceTz !== null) {
            $wire['recurrence_tz'] = $recurrenceTz;
        }
        if ($recurrenceUntil !== null) {
            $wire['recurrence_until'] = $recurrenceUntil;
        }
        if ($emailTo !== null) {
            $wire['email_to'] = $emailTo;
        }
        $wire['target'] = self::targetToWire($target);

        return $wire;
    }

    /**
     * @param array{
     *   all?: bool,
     *   deviceIds?: list<string>,
     *   userIds?: list<string>,
     *   tags?: list<string>,
     *   segment?: array{match?: string, conditions: list<array{field: string, op: string, value?: mixed}>},
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
        if (array_key_exists('tags', $target)) {
            return ['tags' => $target['tags']];
        }
        if (array_key_exists('segment', $target)) {
            /** @var array{match?: string, conditions: list<array{field: string, op: string, value?: mixed}>} $segment */
            $segment = $target['segment'];

            return [
                'segment' => [
                    'match' => $segment['match'] ?? 'all',
                    'conditions' => $segment['conditions'],
                ],
            ];
        }

        // Unknown shape — pass through for forward compatibility.
        /** @var array<string, mixed> $target */
        return $target;
    }

    /**
     * Build a `segment` target — match devices by a list of conditions.
     *
     * Mirrors the other target factories. Returns an array shaped for the
     * `target` parameter of {@see send}:
     *
     * ```php
     * $np->notifications->send(
     *     title: 'Hi',
     *     body: 'There',
     *     target: NotificationsService::segment('any', [
     *         ['field' => 'platform', 'op' => 'eq', 'value' => 'ios'],
     *         ['field' => 'tag', 'op' => 'contains', 'value' => 'vip'],
     *     ]),
     * );
     * ```
     *
     * `$match` is `'all'` (AND, default) or `'any'` (OR) over the conditions.
     * Each condition is `['field' => string, 'op' => string, 'value' => mixed]`
     * where `op` is one of `eq`, `neq`, `in`, `exists`, `contains`, `gt`, `lt`
     * (`value` is omitted for `exists`).
     *
     * @param list<array{field: string, op: string, value?: mixed}> $conditions
     *
     * @return array{segment: array{match: string, conditions: list<array{field: string, op: string, value?: mixed}>}}
     */
    public static function segment(string $match = 'all', array $conditions = []): array
    {
        return [
            'segment' => [
                'match' => $match,
                'conditions' => $conditions,
            ],
        ];
    }
}
