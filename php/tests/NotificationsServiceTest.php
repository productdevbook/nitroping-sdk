<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Exceptions\NetworkException;
use Productdevbook\Nitroping\Exceptions\NitropingException;
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Tests\Fixtures\MockTransport;

final class NotificationsServiceTest extends TestCase
{
    public function testConstructorReadsApiKeyFromEnv(): void
    {
        $original = getenv('NITROPING_API_KEY');
        putenv('NITROPING_API_KEY=np_env_test_key');
        try {
            // No transport injection — exercising the env-var path implies
            // construction of the default cURL transport, which we never
            // call into. This proves `apiKey` resolution works.
            $np = new Nitroping();
            self::assertInstanceOf(Nitroping::class, $np);
        } finally {
            if ($original === false) {
                putenv('NITROPING_API_KEY');
            } else {
                putenv('NITROPING_API_KEY=' . $original);
            }
        }
    }

    public function testConstructorThrowsWhenNoApiKey(): void
    {
        $original = getenv('NITROPING_API_KEY');
        putenv('NITROPING_API_KEY');
        try {
            $this->expectException(NitropingException::class);
            new Nitroping();
        } finally {
            if ($original !== false) {
                putenv('NITROPING_API_KEY=' . $original);
            }
        }
    }

    public function testSendPostsCorrectMethodPathAndBody(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'abc-123', 'status' => 'queued']);

        $np = new Nitroping(apiKey: 'np_test_secret', transport: $mock);

        $result = $np->notifications->send(
            title: 'Order #4129 shipped',
            body: 'On its way',
            deepLink: 'https://example.com/orders/4129',
            actions: [['id' => 'track', 'title' => 'Track']],
            target: ['all' => true],
        );

        self::assertSame('abc-123', $result->id);
        self::assertSame('queued', $result->status);

        self::assertCount(1, $mock->calls);
        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/notifications', $call['path']);
        self::assertSame([
            'title' => 'Order #4129 shipped',
            'body' => 'On its way',
            'deep_link' => 'https://example.com/orders/4129',
            'actions' => [['id' => 'track', 'title' => 'Track']],
            'target' => ['all' => true],
        ], $call['body']);
        self::assertSame([], $call['headers']);
    }

    public function testSendForwardsIdempotencyKeyHeader(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'n1', 'status' => 'queued']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->notifications->send(
            title: 'Hi',
            body: 'There',
            target: ['userIds' => ['u1']],
            idempotencyKey: 'order-shipped-4129',
        );

        $call = $mock->calls[0];
        self::assertSame(['Idempotency-Key' => 'order-shipped-4129'], $call['headers']);
        self::assertNotNull($call['body']);
        self::assertSame(['user_ids' => ['u1']], $call['body']['target']);
    }

    public function testSendConvertsDeviceIdsTargetToSnakeCase(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'n1', 'status' => 'queued']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->notifications->send(
            title: 'x',
            body: 'y',
            target: ['deviceIds' => ['d1', 'd2']],
        );

        $body = $mock->calls[0]['body'];
        self::assertNotNull($body);
        self::assertSame(['device_ids' => ['d1', 'd2']], $body['target']);
    }

    public function testSendConvertsTagsTargetToSnakeCase(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'n1', 'status' => 'queued']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->notifications->send(
            title: 'x',
            body: 'y',
            target: ['tags' => ['vip', 'beta']],
        );

        $body = $mock->calls[0]['body'];
        self::assertNotNull($body);
        self::assertSame(['tags' => ['vip', 'beta']], $body['target']);
    }

    public function testCancelSendsDelete(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'n-1', 'status' => 'canceled']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->notifications->cancel('n-1');

        self::assertSame(['id' => 'n-1', 'status' => 'canceled'], $result);

        $call = $mock->calls[0];
        self::assertSame('DELETE', $call['method']);
        self::assertSame('/api/v1/notifications/n-1', $call['path']);
        self::assertNull($call['body']);
    }

    public function testCancelThrowsCannotCancelOn409(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 409,
            code: 'cannot_cancel',
            message: 'Notification already sent',
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->notifications->cancel('already-sent');
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame('cannot_cancel', $e->errorCode);
            self::assertSame(409, $e->status);
        }
    }

    public function testSendThrowsApiExceptionOn422WithCodeAndDetails(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 422,
            code: 'validation_failed',
            message: 'Request body failed validation',
            details: ['title' => ["can't be blank"]],
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->notifications->send(body: '', target: ['all' => true]);
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame(422, $e->status);
            self::assertSame('validation_failed', $e->errorCode);
            self::assertSame('Request body failed validation', $e->getMessage());
            self::assertSame(['title' => ["can't be blank"]], $e->details);
        }
    }

    public function testSendBubblesNetworkExceptionFromTransport(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new NetworkException('Request to https://nitroping.dev/api/v1/notifications failed: connection refused'));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $this->expectException(NetworkException::class);
        $np->notifications->send(title: 'x', body: 'y', target: ['all' => true]);
    }
}
