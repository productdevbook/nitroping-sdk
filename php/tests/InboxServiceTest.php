<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Tests\Fixtures\MockTransport;

final class InboxServiceTest extends TestCase
{
    public function testListReturnsItemsAndSendsUserIdQuery(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['items' => [
            ['id' => 'i1', 'notification_id' => 'n1', 'read' => false],
            ['id' => 'i2', 'notification_id' => 'n2', 'read' => true],
        ]]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        $items = $np->inbox->list('user-42');

        self::assertCount(2, $items);
        self::assertSame('i1', $items[0]['id']);

        $call = $mock->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertSame('/api/v1/public/inbox?user_id=user-42', $call['path']);
        self::assertNull($call['body']);
    }

    public function testListAppendsUnreadOnlyAndLimitQuery(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['items' => []]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        $items = $np->inbox->list('u1', unreadOnly: true, limit: 50);

        self::assertSame([], $items);

        $call = $mock->calls[0];
        self::assertSame('/api/v1/public/inbox?user_id=u1&unread_only=true&limit=50', $call['path']);
    }

    public function testListHandlesMissingItemsKey(): void
    {
        $mock = new MockTransport();
        $mock->enqueue([]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        self::assertSame([], $np->inbox->list('u1'));
    }

    public function testUnreadCountReturnsInt(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['unread_count' => 7]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        self::assertSame(7, $np->inbox->unreadCount('u1'));

        $call = $mock->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertSame('/api/v1/public/inbox/unread_count?user_id=u1', $call['path']);
    }

    public function testUnreadCountDefaultsToZero(): void
    {
        $mock = new MockTransport();
        $mock->enqueue([]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        self::assertSame(0, $np->inbox->unreadCount('u1'));
    }

    public function testMarkReadPostsToItemPath(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'i1', 'notification_id' => 'n1', 'read' => true]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        $result = $np->inbox->markRead('u1', 'i1');

        self::assertTrue($result['read']);

        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/public/inbox/i1/read', $call['path']);
        self::assertSame(['user_id' => 'u1'], $call['body']);
    }

    public function testMarkAllReadReturnsCount(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['marked_read' => 3]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        self::assertSame(3, $np->inbox->markAllRead('u1'));

        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/public/inbox/read_all', $call['path']);
        self::assertSame(['user_id' => 'u1'], $call['body']);
    }

    public function testMarkAllReadDefaultsToZero(): void
    {
        $mock = new MockTransport();
        $mock->enqueue([]);

        $np = new Nitroping(apiKey: 'pk_x', transport: $mock);
        self::assertSame(0, $np->inbox->markAllRead('u1'));
    }
}
