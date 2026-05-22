<?php

declare(strict_types=1);

namespace Productdevbook\Nitroping\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Base exception thrown by every SDK function. Subclasses set their own
 * stable `$code` string. Catch this class to handle every nitroping
 * failure, or narrow with `instanceof` for specific cases.
 */
class NitropingException extends RuntimeException
{
    /**
     * Stable machine-readable code, mirrored from the server envelope
     * (`error.code`) when applicable, or an SDK-internal code such as
     * `"network_error"` / `"invalid_signature"`.
     */
    public readonly string $errorCode;

    /** Optional HTTP status if this error originated from a response. */
    public readonly ?int $status;

    /**
     * Free-form details — typically the server's `error.details`
     * (field-level validation errors).
     *
     * @var mixed
     */
    public readonly mixed $details;

    public function __construct(
        string $message,
        string $errorCode = 'error',
        ?int $status = null,
        mixed $details = null,
        ?Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
        $this->errorCode = $errorCode;
        $this->status = $status;
        $this->details = $details;
    }
}
