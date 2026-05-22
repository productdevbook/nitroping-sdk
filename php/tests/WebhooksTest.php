<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Tests;

use PHPUnit\Framework\TestCase;
use Productdevbook\Nitroping\Exceptions\InvalidSignatureException;
use Productdevbook\Nitroping\Exceptions\MissingSignatureHeaderException;
use Productdevbook\Nitroping\Exceptions\NitropingException;
use Productdevbook\Nitroping\Exceptions\TimestampOutOfRangeException;
use Productdevbook\Nitroping\Webhooks;

final class WebhooksTest extends TestCase
{
    private const SECRET = 'whsec_test_0123456789abcdef';

    public function testVerifyAcceptsValidSignatureAndReturnsParsedEvent(): void
    {
        $payload = [
            'id' => 'evt_abc',
            'type' => 'notification.delivered',
            'created_at' => '2026-05-22T10:00:00Z',
            'data' => ['notification_id' => 'n1'],
        ];
        $body = (string) json_encode($payload);
        $t = 1_700_000_000;
        $header = Webhooks::sign(self::SECRET, $body, $t);

        $event = Webhooks::verify(
            body: $body,
            signature: $header,
            secret: self::SECRET,
            now: $t,
        );

        self::assertSame('evt_abc', $event->id);
        self::assertSame('notification.delivered', $event->type);
        self::assertSame('2026-05-22T10:00:00Z', $event->createdAt);
        self::assertSame(['notification_id' => 'n1'], $event->data);
    }

    public function testSignProducesExpectedHeaderFormat(): void
    {
        $header = Webhooks::sign(self::SECRET, '{}', 1_700_000_000);
        self::assertMatchesRegularExpression('/^t=\d+, v1=[0-9a-f]+$/', $header);
        self::assertStringStartsWith('t=1700000000, v1=', $header);
    }

    public function testTamperedBodyThrowsInvalidSignature(): void
    {
        $t = 1_700_000_000;
        $header = Webhooks::sign(self::SECRET, (string) json_encode(['ok' => true]), $t);

        $this->expectException(InvalidSignatureException::class);
        Webhooks::verify(
            body: (string) json_encode(['ok' => false]),
            signature: $header,
            secret: self::SECRET,
            now: $t,
        );
    }

    public function testWrongSecretThrowsInvalidSignature(): void
    {
        $t = 1_700_000_000;
        $body = (string) json_encode(['ok' => true]);
        $header = Webhooks::sign(self::SECRET, $body, $t);

        $this->expectException(InvalidSignatureException::class);
        Webhooks::verify(
            body: $body,
            signature: $header,
            secret: 'whsec_wrong',
            now: $t,
        );
    }

    public function testOldTimestampThrowsTimestampOutOfRange(): void
    {
        $signedAt = 1_700_000_000;
        $body = (string) json_encode(['ok' => true]);
        $header = Webhooks::sign(self::SECRET, $body, $signedAt);

        $this->expectException(TimestampOutOfRangeException::class);
        Webhooks::verify(
            body: $body,
            signature: $header,
            secret: self::SECRET,
            now: $signedAt + 1000, // default tolerance is 300
        );
    }

    public function testWiderToleranceBypassesTimestampCheck(): void
    {
        $signedAt = 1_700_000_000;
        $body = (string) json_encode([
            'id' => 'evt_x',
            'type' => 'notification.delivered',
            'created_at' => '2026-01-01T00:00:00Z',
            'data' => ['x' => 1],
        ]);
        $header = Webhooks::sign(self::SECRET, $body, $signedAt);

        $event = Webhooks::verify(
            body: $body,
            signature: $header,
            secret: self::SECRET,
            tolerance: 90_000,
            now: $signedAt + 86_400,
        );

        self::assertSame('evt_x', $event->id);
        self::assertSame(['x' => 1], $event->data);
    }

    public function testMissingHeaderThrowsMissingSignatureHeaderException(): void
    {
        $this->expectException(MissingSignatureHeaderException::class);
        Webhooks::verify(
            body: '{}',
            signature: null,
            secret: self::SECRET,
        );
    }

    public function testEmptyStringHeaderThrowsMissingSignatureHeaderException(): void
    {
        $this->expectException(MissingSignatureHeaderException::class);
        Webhooks::verify(
            body: '{}',
            signature: '',
            secret: self::SECRET,
        );
    }

    public function testMalformedHeaderThrowsInvalidSignatureException(): void
    {
        $this->expectException(InvalidSignatureException::class);
        Webhooks::verify(
            body: '{}',
            signature: 'not-a-real-header',
            secret: self::SECRET,
        );
    }

    public function testNonJsonBodyThrowsNitropingExceptionInvalidBody(): void
    {
        $t = 1_700_000_000;
        $header = Webhooks::sign(self::SECRET, 'not-json', $t);

        try {
            Webhooks::verify(
                body: 'not-json',
                signature: $header,
                secret: self::SECRET,
                now: $t,
            );
            self::fail('Expected NitropingException');
        } catch (NitropingException $e) {
            self::assertSame('invalid_body', $e->errorCode);
        }
    }

    public function testMatchesElixirServersReferenceHmacVector(): void
    {
        // Locked-in vector mirroring js/test/webhooks.test.ts:
        //   secret="0123456789abcdef", t=1700000000, body='{"hello":"world"}'.
        // Computed via:
        //   iex> :crypto.mac(:hmac, :sha256, "0123456789abcdef", "1700000000.{\"hello\":\"world\"}")
        //   |> Base.encode16(case: :lower)
        $secret = '0123456789abcdef';
        $body = '{"hello":"world"}';
        $t = 1_700_000_000;

        $header = Webhooks::sign($secret, $body, $t);

        // If this breaks, the PHP impl has drifted from the Elixir server.
        self::assertSame(
            't=1700000000, v1=66997eb7c1d13335f141deda66669e544a2c7f62745300308aec8f7042fb18be',
            $header,
        );

        // Verify accepts it.
        $event = Webhooks::verify(
            body: $body,
            signature: $header,
            secret: $secret,
            now: $t,
        );
        self::assertSame('', $event->id); // body has no `id`
        // The raw body decodes to ["hello" => "world"], confirm by re-decoding:
        self::assertSame(['hello' => 'world'], json_decode($body, true));
    }
}
