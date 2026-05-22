<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

/**
 * Thrown by `Webhooks::verify` when the signature is well-formed and
 * matches the body, but its `t=` timestamp is outside the tolerance
 * window. Defends against signature replay.
 */
final class TimestampOutOfRangeException extends NitropingException
{
    public function __construct(string $message = 'Webhook timestamp is outside the allowed tolerance')
    {
        parent::__construct($message, 'timestamp_out_of_range');
    }
}
