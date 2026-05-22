<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Nitroping;
use Productdevbook\Nitroping\Tests\Fixtures\MockTransport;

final class DevicesServiceTest extends TestCase
{
    public function testRegisterPostsSnakeCaseBody(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-1', 'created' => true]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $result = $np->devices->register(
            platform: 'ios',
            token: 'apns-token-abc',
            userId: 'user-42',
            metadata: ['source' => 'tests'],
        );

        self::assertSame(['id' => 'dev-1', 'created' => true], $result);

        $call = $mock->calls[0];
        self::assertSame('POST', $call['method']);
        self::assertSame('/api/v1/devices', $call['path']);
        self::assertSame([
            'platform' => 'ios',
            'token' => 'apns-token-abc',
            'user_id' => 'user-42',
            'metadata' => ['source' => 'tests'],
        ], $call['body']);
    }

    public function testRegisterSupportsWebPlatformWithP256dhAndAuth(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-2', 'created' => false]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->devices->register(
            platform: 'web',
            token: 'https://fcm.googleapis.com/abc',
            webPushP256dh: 'BPS_p256dh_value',
            webPushAuth: 'auth_secret_value',
        );

        $body = $mock->calls[0]['body'];
        self::assertNotNull($body);
        self::assertSame('BPS_p256dh_value', $body['web_push_p256dh']);
        self::assertSame('auth_secret_value', $body['web_push_auth']);
        self::assertSame('web', $body['platform']);
    }

    public function testDeactivateSendsDelete(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-1', 'status' => 'inactive']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->devices->deactivate('dev-1');

        self::assertSame(['id' => 'dev-1', 'status' => 'inactive'], $result);
        $call = $mock->calls[0];
        self::assertSame('DELETE', $call['method']);
        self::assertSame('/api/v1/devices/dev-1', $call['path']);
        self::assertNull($call['body']);
    }

    public function testDeactivateThrowsNotFoundOn404(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 404,
            code: 'not_found',
            message: 'Device not found',
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->devices->deactivate('missing');
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame('not_found', $e->errorCode);
            self::assertSame(404, $e->status);
        }
    }
}
