<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

/**
 * Thrown by `Webhooks::verify` when the computed HMAC does not match the
 * `v1=` value in the `X-Nitroping-Signature` header, or the header is
 * present but malformed.
 */
final class InvalidSignatureException extends NitropingException
{
    public function __construct(string $message = 'Webhook signature does not match request body')
    {
        parent::__construct($message, 'invalid_signature');
    }
}
