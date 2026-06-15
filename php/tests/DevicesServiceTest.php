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

    public function testListGetsDevicesWithSnakeCaseQueryAndCamelCasesRows(): void
    {
        $mock = new MockTransport();
        $mock->enqueue([
            'data' => [
                [
                    'id' => 'dev-1',
                    'user_id' => 'alice',
                    'platform' => 'ios',
                    'status' => 'active',
                    'tags' => ['vip'],
                    'timezone' => 'Europe/Istanbul',
                    'apns_environment' => 'production',
                    'last_seen_at' => '2026-06-15T00:00:00Z',
                    'inserted_at' => '2026-06-14T00:00:00Z',
                ],
            ],
            'total' => 1,
        ]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $res = $np->devices->list(
            userId: 'alice',
            platform: 'ios',
            pageSize: 10,
        );

        self::assertSame(1, $res['total']);
        self::assertSame([
            'id' => 'dev-1',
            'userId' => 'alice',
            'platform' => 'ios',
            'status' => 'active',
            'tags' => ['vip'],
            'timezone' => 'Europe/Istanbul',
            'apnsEnvironment' => 'production',
            'lastSeenAt' => '2026-06-15T00:00:00Z',
            'insertedAt' => '2026-06-14T00:00:00Z',
        ], $res['data'][0]);

        $call = $mock->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertNull($call['body']);
        self::assertStringStartsWith('/api/v1/devices?', $call['path']);
        self::assertStringContainsString('user_id=alice', $call['path']);
        self::assertStringContainsString('platform=ios', $call['path']);
        self::assertStringContainsString('page_size=10', $call['path']);
    }

    public function testListNeverExposesPushToken(): void
    {
        $mock = new MockTransport();
        // Even if the server were to (incorrectly) leak a token, the SDK's
        // mapping projects a fixed key set that has no `token` field.
        $mock->enqueue([
            'data' => [
                [
                    'id' => 'dev-1',
                    'user_id' => null,
                    'platform' => 'android',
                    'status' => 'active',
                    'tags' => [],
                    'timezone' => null,
                    'apns_environment' => null,
                    'last_seen_at' => null,
                    'inserted_at' => '2026-06-14T00:00:00Z',
                    'token' => 'should-never-surface',
                ],
            ],
            'total' => 1,
        ]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $res = $np->devices->list();

        self::assertArrayNotHasKey('token', $res['data'][0]);
        self::assertSame([
            'id',
            'userId',
            'platform',
            'status',
            'tags',
            'timezone',
            'apnsEnvironment',
            'lastSeenAt',
            'insertedAt',
        ], array_keys($res['data'][0]));
    }

    public function testListWithNoFiltersSendsBarePathAndHandlesEmptyListing(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['data' => [], 'total' => 0]);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $res = $np->devices->list();

        self::assertSame(['data' => [], 'total' => 0], $res);

        $call = $mock->calls[0];
        self::assertSame('GET', $call['method']);
        self::assertSame('/api/v1/devices', $call['path']);
        self::assertNull($call['body']);
    }

    public function testDeactivateByTokenSendsDeleteWithTokenBody(): void
    {
        $mock = new MockTransport();
        $mock->enqueue(['id' => 'dev-9', 'status' => 'inactive']);

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);
        $result = $np->devices->deactivateByToken('apns-token-xyz');

        self::assertSame(['id' => 'dev-9', 'status' => 'inactive'], $result);

        $call = $mock->calls[0];
        self::assertSame('DELETE', $call['method']);
        self::assertSame('/api/v1/devices', $call['path']);
        self::assertSame(['token' => 'apns-token-xyz'], $call['body']);
    }

    public function testDeactivateByTokenThrowsNotFoundOn404(): void
    {
        $mock = new MockTransport();
        $mock->enqueueError(new ApiException(
            status: 404,
            code: 'not_found',
            message: 'Device not found',
        ));

        $np = new Nitroping(apiKey: 'np_x', transport: $mock);

        try {
            $np->devices->deactivateByToken('nope');
            self::fail('Expected ApiException');
        } catch (ApiException $e) {
            self::assertSame('not_found', $e->errorCode);
            self::assertSame(404, $e->status);
        }
    }
}
