<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping;

use Productdevbook\Nitroping\Exceptions\InvalidSignatureException;
use Productdevbook\Nitroping\Exceptions\MissingSignatureHeaderException;
use Productdevbook\Nitroping\Exceptions\NitropingException;
use Productdevbook\Nitroping\Exceptions\TimestampOutOfRangeException;
use Productdevbook\Nitroping\Models\WebhookEvent;

/**
 * Verify outbound webhook signatures from the nitroping server.
 *
 * The server signs every webhook with HMAC-SHA256 and ships the result
 * in the `X-Nitroping-Signature` header. The header format mirrors
 * Polar / Stripe:
 *
 *     X-Nitroping-Signature: t=1700000000, v1=<hex>
 *
 * where `v1 = hash_hmac('sha256', $t . '.' . $body, $secret)`.
 *
 * @example
 * ```php
 * use Productdevbook\Nitroping\Webhooks;
 *
 * $event = Webhooks::verify(
 *     body: $rawBody,
 *     signature: $_SERVER['HTTP_X_NITROPING_SIGNATURE'] ?? null,
 *     secret: getenv('NITROPING_WEBHOOK_SECRET') ?: '',
 * );
 *
 * if ($event->type === 'notification.delivered') {
 *     // ...
 * }
 * ```
 */
final class Webhooks
{
    /**
     * Verify and parse a webhook delivery.
     *
     * @param string             $body      raw request body, exactly as received (do not re-encode parsed JSON)
     * @param string|string[]|null $signature value of the `X-Nitroping-Signature` header (string, list of strings, or null)
     * @param string             $secret    webhook signing secret
     * @param int                $tolerance maximum drift between `t=` and the verifier's wall clock, in seconds (default 300)
     * @param int|null           $now       override "now" (unix seconds) — useful for tests
     *
     * @throws MissingSignatureHeaderException if the `signature` argument is null/empty
     * @throws InvalidSignatureException       if the header is malformed or HMAC mismatch
     * @throws TimestampOutOfRangeException    if signature valid but timestamp is outside tolerance
     * @throws NitropingException              if the verified body is not valid JSON
     */
    public static function verify(
        string $body,
        string|array|null $signature,
        string $secret,
        int $tolerance = 300,
        ?int $now = null,
    ): WebhookEvent {
        $header = self::pickHeader($signature);
        if ($header === null || $header === '') {
            throw new MissingSignatureHeaderException();
        }

        $parsed = self::parseSignatureHeader($header);
        if ($parsed === null) {
            throw new InvalidSignatureException('Malformed X-Nitroping-Signature header');
        }
        [$t, $v1] = $parsed;

        $expected = bin2hex(hash_hmac('sha256', $t . '.' . $body, $secret, true));

        if (!hash_equals($expected, $v1)) {
            throw new InvalidSignatureException();
        }

        $currentTime = $now ?? time();
        if (abs($currentTime - $t) > $tolerance) {
            throw new TimestampOutOfRangeException(
                sprintf(
                    'Webhook timestamp %d is more than %ds from now (%d)',
                    $t,
                    $tolerance,
                    $currentTime,
                ),
            );
        }

        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            throw new NitropingException(
                'Webhook body is not valid JSON: ' . json_last_error_msg(),
                'invalid_body',
            );
        }

        /** @var array<string, mixed> $decoded */
        return WebhookEvent::fromArray($decoded);
    }

    /**
     * Compute a header value for the nitroping signing scheme. Mostly
     * useful for tests; production code should rely on the server.
     */
    public static function sign(string $secret, string $body, ?int $timestamp = null): string
    {
        $t = $timestamp ?? time();
        $v1 = bin2hex(hash_hmac('sha256', $t . '.' . $body, $secret, true));

        return sprintf('t=%d, v1=%s', $t, $v1);
    }

    /**
     * @param string|string[]|null $input
     */
    private static function pickHeader(string|array|null $input): ?string
    {
        if ($input === null) {
            return null;
        }
        if (is_array($input)) {
            return $input[0] ?? null;
        }

        return $input;
    }

    /**
     * @return array{0: int, 1: string}|null
     */
    private static function parseSignatureHeader(string $header): ?array
    {
        $t = null;
        $v1 = null;
        foreach (explode(',', $header) as $part) {
            $part = trim($part);
            $eq = strpos($part, '=');
            if ($eq === false || $eq === 0) {
                continue;
            }
            $key = trim(substr($part, 0, $eq));
            $value = trim(substr($part, $eq + 1));
            if ($key === 't') {
                if (!preg_match('/^-?\d+$/', $value)) {
                    return null;
                }
                $t = (int) $value;
            } elseif ($key === 'v1') {
                if (!preg_match('/^[0-9a-f]+$/i', $value)) {
                    return null;
                }
                $v1 = strtolower($value);
            }
        }
        if ($t === null || $v1 === null) {
            return null;
        }

        return [$t, $v1];
    }
}
