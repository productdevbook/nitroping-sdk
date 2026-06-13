<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Internal;

use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Exceptions\NetworkException;
use Productdevbook\Nitroping\Exceptions\NitropingException;

/**
 * Default {@see HttpTransport} backed by ext-curl.
 *
 * Holds the base URL, API key, auth scheme, timeout, and user agent.
 * Each request constructs a fresh cURL handle so the transport is
 * stateless from the caller's perspective — there's no connection
 * pool, but the HTTP/2 + keep-alive defaults are good enough for the
 * typical "fire a few sends per request" workload.
 */
final class CurlTransport implements HttpTransport
{
    public const DEFAULT_BASE_URL = 'https://nitroping.dev';
    public const SDK_VERSION = '0.2.9';

    private readonly string $baseUrl;

    public readonly string $resolvedAuthScheme;

    /** @var (callable(array<string, mixed>): void)|null */
    private $debugSink;

    /**
     * @param bool|(callable(array<string, mixed>): void) $debug
     *   Opt-in request/response logging. `false` (default) disables it;
     *   `true` writes a redacted JSON line per event via `error_log()`; a
     *   `callable(array $event): void` receives each event array instead.
     *   The `Authorization` header / API key is always redacted.
     */
    public function __construct(
        private readonly string $apiKey,
        string $baseUrl = self::DEFAULT_BASE_URL,
        private readonly int $timeoutSeconds = 30,
        ?string $authScheme = null,
        private readonly string $userAgent = 'nitroping-php/' . self::SDK_VERSION,
        bool|callable $debug = false,
    ) {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->resolvedAuthScheme = $authScheme ?? (str_starts_with($this->apiKey, 'pk_') ? 'Public' : 'ApiKey');

        if ($debug === true) {
            $this->debugSink = static function (array $event): void {
                $line = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                error_log('[nitroping] ' . ($line === false ? '{}' : $line));
            };
        } elseif ($debug === false) {
            $this->debugSink = null;
        } else {
            $this->debugSink = $debug;
        }
    }

    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>|null $body
     *
     * @return array<string, mixed>
     */
    public function request(string $method, string $path, array $headers = [], ?array $body = null): array
    {
        $url = $this->baseUrl . (str_starts_with($path, '/') ? $path : '/' . $path);

        $requestHeaders = [
            'Authorization: ' . $this->resolvedAuthScheme . ' ' . $this->apiKey,
            'Accept: application/json',
            'User-Agent: ' . $this->userAgent,
        ];

        $bodyText = null;
        if ($body !== null) {
            $encoded = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($encoded === false) {
                throw new NitropingException(
                    'Failed to JSON-encode request body: ' . json_last_error_msg(),
                    'invalid_argument',
                );
            }
            $bodyText = $encoded;
            $requestHeaders[] = 'Content-Type: application/json';
        }

        foreach ($headers as $name => $value) {
            $requestHeaders[] = $name . ': ' . $value;
        }

        $this->emit([
            'phase' => 'request',
            'method' => $method,
            'url' => $url,
            'headers' => self::redactHeaders($requestHeaders),
            'body' => $bodyText,
        ]);

        $ch = curl_init();
        if ($ch === false) {
            throw new NetworkException('Failed to initialize cURL handle');
        }

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, $requestHeaders);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->timeoutSeconds);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $this->timeoutSeconds);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
        if ($bodyText !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $bodyText);
        }

        /** @var string|false $rawResponse */
        $rawResponse = curl_exec($ch);
        if ($rawResponse === false) {
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            curl_close($ch);
            $this->emit([
                'phase' => 'error',
                'method' => $method,
                'url' => $url,
                'errno' => $errno,
                'error' => $error,
            ]);
            throw new NetworkException(
                sprintf('Request to %s failed: %s (cURL errno %d)', $url, $error, $errno),
            );
        }

        $statusValue = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $status = is_int($statusValue) ? $statusValue : 0;
        curl_close($ch);

        $this->emit([
            'phase' => 'response',
            'method' => $method,
            'url' => $url,
            'status' => $status,
            'body' => $rawResponse,
        ]);

        return $this->parseResponse($status, $rawResponse);
    }

    /**
     * Dispatch a debug event to the configured sink (no-op when disabled).
     *
     * @param array<string, mixed> $event
     */
    private function emit(array $event): void
    {
        if ($this->debugSink !== null) {
            ($this->debugSink)($event);
        }
    }

    /**
     * Redact the `Authorization` header so secrets never reach the debug log.
     *
     * @param list<string> $headers
     *
     * @return list<string>
     */
    private static function redactHeaders(array $headers): array
    {
        $redacted = [];
        foreach ($headers as $header) {
            if (stripos($header, 'Authorization:') === 0) {
                $redacted[] = 'Authorization: [REDACTED]';
            } else {
                $redacted[] = $header;
            }
        }

        return $redacted;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseResponse(int $status, string $body): array
    {
        /** @var array<string, mixed>|null $json */
        $json = null;
        if ($body !== '') {
            /** @var mixed $decoded */
            $decoded = json_decode($body, true);
            if (is_array($decoded)) {
                /** @var array<string, mixed> $decoded */
                $json = $decoded;
            } elseif ($decoded !== null) {
                // Server returned a scalar — wrap it so the return type holds.
                $json = ['value' => $decoded];
            }
        }

        if ($status >= 200 && $status < 300) {
            return $json ?? [];
        }

        $envelope = [];
        if ($json !== null && isset($json['error']) && is_array($json['error'])) {
            /** @var array<string, mixed> $envelope */
            $envelope = $json['error'];
        }

        $codeRaw = $envelope['code'] ?? null;
        $code = is_string($codeRaw) ? $codeRaw : 'http_' . $status;
        $messageRaw = $envelope['message'] ?? null;
        $message = is_string($messageRaw) ? $messageRaw : 'HTTP ' . $status;
        $details = $envelope['details'] ?? null;

        throw new ApiException(
            status: $status,
            code: $code,
            message: $message,
            details: $details,
        );
    }
}
