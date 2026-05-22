<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

use Throwable;

/**
 * Thrown when the nitroping API returns a non-2xx response. Carries the
 * HTTP status, the stable error code, the human message and (for
 * validation failures) the per-field details from the server envelope.
 */
final class ApiException extends NitropingException
{
    public function __construct(
        int $status,
        string $code,
        string $message,
        mixed $details = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct(
            message: $message,
            errorCode: $code,
            status: $status,
            details: $details,
            previous: $previous,
        );
    }
}
