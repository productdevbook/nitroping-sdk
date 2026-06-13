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

    public function testRegisterForwardsTags(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-3', 'created' => true]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->devices->register(
            platform: 'android',
            token: 'fcm-token-xyz',
            tags: ['vip', 'beta'],
        );

        $body = $mock->calls[0]['body'];
        self::assertNotNull($body);
        self::assertSame(['vip', 'beta'], $body['tags']);
    }

    public function testRegisterForwardsTimezone(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-4', 'created' => true]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        $np->devices->register(
            platform: 'ios',
            token: 'apns-token',
            environment: 'production',
            timezone: 'Europe/Istanbul',
        );

        $body = $mock->calls[0]['body'];
        self::assertNotNull($body);
        self::assertSame('production', $body['environment']);
        self::assertSame('Europe/Istanbul', $body['timezone']);
    }

    public function testUpdateSendsPutWithTags(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-1', 'tags' => ['vip', 'beta']]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->devices->update('dev-1', ['vip', 'beta']);

        self::assertSame(['id' => 'dev-1', 'tags' => ['vip', 'beta']], $result);

        $call = $mock->calls[0];
        self::assertSame('PUT', $call['method']);
        self::assertSame('/api/v1/devices/dev-1', $call['path']);
        self::assertSame(['tags' => ['vip', 'beta']], $call['body']);
    }

    public function testUpdateThrowsNotFoundOn404(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 404,
            code: 'not_found',
            message: 'Device not found',
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->devices->update('missing', ['x']);
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame('not_found', $e->errorCode);
            self::assertSame(404, $e->status);
        }
    }

    public function testFetchVapidPublicKeyGetsPublicEndpoint(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['public_key' => 'BPS_vapid_public_key']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->devices->fetchVapidPublicKey('app-123');

        self::assertSame(['public_key' => 'BPS_vapid_public_key'], $result);

        $call = $mock->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertSame('/api/v1/public/apps/app-123/vapid', $call['path']);
        self::assertNull($call['body']);
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
