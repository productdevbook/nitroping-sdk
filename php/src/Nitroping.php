<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Exceptions\NitropingException;
use Productdevbook\Nitroping\Internal\CurlTransport;
use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * `Nitroping` — main server-side SDK entry point.
 *
 * @example
 * ```php
 * use Productdevbook\Nitroping\Nitroping;
 *
 * $np = new Nitroping(apiKey: 'np_live_...');
 *
 * $result = $np->notifications->send(
 *     title: 'Order #4129 shipped',
 *     body: 'On its way',
 *     target: ['all' => true],
 *     idempotencyKey: 'order-shipped-4129',
 * );
 *
 * echo $result->id, ' ', $result->status; // "abc-...", "queued"
 * ```
 *
 * The constructor accepts an optional {@see HttpTransport} so tests can
 * inject a {@see \Productdevbook\Nitroping\Tests\Fixtures\MockTransport}
 * without touching the network. In production, leave it `null` and the
 * client will spin up a ext-curl backed transport for you.
 */
final class Nitroping
{
    /** `notifications` resource — send, get. */
    public readonly NotificationsService $notifications;

    /** `devices` resource — register, deactivate. */
    public readonly DevicesService $devices;

    /** `events` resource — record delivery/open/click telemetry. */
    public readonly EventsService $events;

    /** `inbox` resource — list/read in-app notification-center items. */
    public readonly InboxService $inbox;

    /** `track` resource — server-side delivery/open/click callbacks. */
    public readonly TrackService $track;

    /** Internal transport. Exposed for advanced use (custom requests). */
    public readonly HttpTransport $transport;

    /**
     * @param string|null $apiKey
     *   Secret API key (`np_...`). Falls back to `NITROPING_API_KEY` env
     *   var when omitted.
     * @param string      $baseUrl     defaults to `https://nitroping.dev`
     * @param int         $timeoutSeconds per-request timeout (default 30s)
     * @param HttpTransport|null $transport
     *   Inject a custom transport (mocks, alternative HTTP clients,
     *   etc.). When `null`, the default ext-curl transport is built
     *   from the other arguments.
     * @param bool|(callable(array<string, mixed>): void) $debug
     *   Opt-in request/response debug logging (off by default). `true`
     *   writes a redacted JSON line per HTTP event via `error_log()`; a
     *   `callable(array $event): void` receives each event array instead —
     *   each carries at least `['phase' => 'request'|'response'|'error',
     *   'method' => string, 'url' => string]`. The `Authorization` header /
     *   API key is always redacted. Ignored when a custom `$transport` is
     *   injected (wire debug into your own transport in that case).
     */
    public function __construct(
        ?string $apiKey = null,
        string $baseUrl = CurlTransport::DEFAULT_BASE_URL,
        int $timeoutSeconds = 30,
        ?HttpTransport $transport = null,
        bool|callable $debug = false,
    ) {
        if ($transport === null) {
            $key = $apiKey ?? self::readEnv('NITROPING_API_KEY');
            if ($key === null || $key === '') {
                throw new NitropingException(
                    'apiKey is required. Pass it to `new Nitroping(apiKey: ...)` or set the NITROPING_API_KEY environment variable.',
                    'invalid_argument',
                );
            }
            $transport = new CurlTransport(
                apiKey: $key,
                baseUrl: $baseUrl,
                timeoutSeconds: $timeoutSeconds,
                debug: $debug,
            );
        }

        $this->transport = $transport;
        $this->notifications = new NotificationsService($transport);
        $this->devices = new DevicesService($transport);
        $this->events = new EventsService($transport);
        $this->inbox = new InboxService($transport);
        $this->track = new TrackService($transport);
    }

    private static function readEnv(string $name): ?string
    {
        $value = getenv($name);
        if ($value === false || $value === '') {
            return null;
        }

        return $value;
    }
}
