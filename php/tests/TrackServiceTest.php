<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Tests\Fixtures\MockTransport;

final class TrackServiceTest extends TestCase
{
    public function testRecordWithDeliveryLogIdShape(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['accepted' => true]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->track->record([
            'deliveryLogId' => 'dl-1',
            'event' => 'opened',
        ]);

        self::assertSame(['accepted' => true], $result);

        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/track', $call['path']);
        self::assertSame([
            'delivery_log_id' => 'dl-1',
            'event' => 'opened',
        ], $call['body']);
    }

    public function testRecordWithNotificationAndDeviceTokenShape(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['accepted' => true]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $np->track->record([
            'notificationId' => 'n-1',
            'deviceToken' => 'apns-token-abc',
            'event' => 'clicked',
        ]);

        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/track', $call['path']);
        self::assertSame([
            'event' => 'clicked',
            'notification_id' => 'n-1',
            'device_token' => 'apns-token-abc',
        ], $call['body']);
    }

    public function testRecordBubblesApiException(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 404,
            code: 'not_found',
            message: 'Delivery log not found',
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->track->record(['deliveryLogId' => 'missing', 'event' => 'delivered']);
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame('not_found', $e->errorCode);
            self::assertSame(404, $e->status);
        }
    }
}
