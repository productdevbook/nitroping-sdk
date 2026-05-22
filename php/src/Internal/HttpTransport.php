<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Internal;

use Productdevbook\Nitroping\Exceptions\ApiException;
use Productdevbook\Nitroping\Exceptions\NetworkException;
use Productdevbook\Nitroping\Exceptions\NitropingException;

/**
 * Internal HTTP client used by the resource services.
 *
 * Default implementation uses ext-curl directly so the SDK has zero
 * composer runtime dependencies. Tests inject a mock transport via the
 * `Nitroping` constructor (see {@see MockTransport}).
 *
 * Implementations are responsible for:
 *   - JSON-encoding the body (when not null)
 *   - sending the `Authorization` + `Accept` + `Content-Type` headers
 *   - parsing the JSON response
 *   - translating non-2xx into {@see ApiException} using the
 *     `{error: {code, message, details}}` envelope
 *   - translating transport failures into {@see NetworkException}
 */
interface HttpTransport
{
    /**
     * Perform an HTTP request and return the decoded JSON envelope as
     * an associative array. Returns an empty array for `204 No Content`.
     *
     * @param array<string, string> $headers extra request headers (merged on top of auth + accept defaults)
     * @param array<string, mixed>|null $body JSON body, or `null` for no body
     *
     * @return array<string, mixed>
     *
     * @throws ApiException     on non-2xx responses
     * @throws NetworkException on transport-level failures
     * @throws NitropingException on misconfiguration (e.g. invalid JSON returned by server)
     */
    public function request(string $method, string $path, array $headers = [], ?array $body = null): array;
}
