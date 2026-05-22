<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests\Fixtures;

use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Exceptions\NetworkException;
use Productdevbook\Nitroping\Internal\HttpTransport;

/**
 * Recording / scripted HTTP transport for tests.
 *
 * Records every call (method, path, headers, body) and returns scripted
 * responses in FIFO order. If `enqueueError` is used the next call
 * throws instead of returning. When the queue is empty the transport
 * returns an empty array (so most tests can ignore the queue entirely).
 */
final class MockTransport implements HttpTransport
{
    /** @var list<array{method: string, path: string, headers: array<string, string>, body: array<string, mixed>|null}> */
    public array $calls = [];

    /** @var list<array<string, mixed>|\Throwable> */
    private array $responses = [];

    /**
     * @param array<string, mixed> $response
     */
    public function enqueue(array $response): void
    {
        $this->responses[] = $response;
    }

    public function enqueueError(\Throwable $error): void
    {
        $this->responses[] = $error;
    }

    /**
     * @param array<string, string>     $headers
     * @param array<string, mixed>|null $body
     *
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, array $headers = [], ?array $body = null): array
    {
        $this->calls[] = [
            'method' => $method,
            'path' => $path,
            'headers' => $headers,
            'body' => $body,
        ];

        if ($this->responses === []) {
            return [];
        }
        $next = array_shift($this->responses);
        if ($next instanceof \Throwable) {
            throw $next;
        }

        return $next;
    }

    /** Helper: build a server-style ApiException for tests. */
    public static function apiError(int $status, string $code, string $message, mixed $details = null): ApiException
    {
        return new ApiException($status, $code, $message, $details);
    }

    /** Helper: build a NetworkException for tests. */
    public static function networkError(string $message = 'connection refused'): NetworkException
    {
        return new NetworkException($message);
    }
}
