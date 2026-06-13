<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Exceptions\NetworkException;
use Productdevbook\Nitroping\Internal\CurlTransport;

/**
 * Exercises the opt-in debug logging in {@see CurlTransport}.
 *
 * Points the transport at a closed local port so the request fails fast at
 * the transport layer (no external network), which deterministically emits a
 * `request` event followed by an `error` event.
 */
final class CurlTransportDebugTest extends TestCase
{
    public function testDebugCallableReceivesRedactedRequestAndErrorEvents(): void
    {
        /** @var list<array<string, mixed>> $events */
        $events = [];

        $transport = new CurlTransport(
            apiKey: 'np_super_secret_key',
            // Reserved-for-documentation IP that won't route → fast failure.
            baseUrl: 'http://127.0.0.1:1',
            timeoutSeconds: 1,
            debug: function (array $event) use (&$events): void {
                $events[] = $event;
            },
        );

        try {
            $transport->request('POST', '/api/v1/notifications', [], ['title' => 'hi']);
            self::fail('Expected NetworkException');
        } catch (NetworkException) {
            // expected
        }

        self::assertNotEmpty($events);

        $request = $events[0];
        self::assertSame('request', $request['phase']);
        self::assertSame('POST', $request['method']);
        self::assertSame('http://127.0.0.1:1/api/v1/notifications', $request['url']);

        // The API key must never appear in any emitted event.
        $serialized = json_encode($events);
        self::assertIsString($serialized);
        self::assertStringNotContainsString('np_super_secret_key', $serialized);

        /** @var list<string> $headers */
        $headers = $request['headers'];
        $hasRedactedAuth = false;
        foreach ($headers as $header) {
            if (str_starts_with($header, 'Authorization:')) {
                self::assertSame('Authorization: [REDACTED]', $header);
                $hasRedactedAuth = true;
            }
        }
        self::assertTrue($hasRedactedAuth);

        $error = $events[array_key_last($events)];
        self::assertSame('error', $error['phase']);
        self::assertSame('POST', $error['method']);
    }

    public function testDebugDefaultsOffDoesNotThrow(): void
    {
        // Just constructing with debug off must be a no-op (sink stays null).
        $transport = new CurlTransport(apiKey: 'np_x');
        self::assertInstanceOf(CurlTransport::class, $transport);
    }
}
