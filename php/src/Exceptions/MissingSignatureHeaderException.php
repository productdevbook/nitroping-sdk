<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

/**
 * Thrown by `Webhooks::verify` when the `X-Nitroping-Signature` header
 * is absent from the incoming request.
 */
final class MissingSignatureHeaderException extends NitropingException
{
    public function __construct(string $message = 'Missing X-Nitroping-Signature header')
    {
        parent::__construct($message, 'missing_signature');
    }
}
