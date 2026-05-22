<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

use Throwable;

/**
 * Thrown when the HTTP transport itself failed — DNS, TLS, connection
 * reset, timeout. The underlying cURL or other transport error is
 * attached as `$previous`.
 */
final class NetworkException extends NitropingException
{
    public function __construct(string $message, ?Throwable $previous = null)
    {
        parent::__construct(
            message: $message,
            errorCode: 'network_error',
            previous: $previous,
        );
    }
}
