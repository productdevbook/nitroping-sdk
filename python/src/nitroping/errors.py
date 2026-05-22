"""Error hierarchy for the nitroping SDK.

All public functions raise subclasses of :class:`NitropingError`. Catch the
base class to handle every error, or narrow by ``isinstance`` on the
specific subclass when you want to switch on a known failure mode (e.g.
retry on :class:`NetworkError`, surface an HTTP 400 on
:class:`InvalidSignatureError`).
"""

from __future__ import annotations

from typing import Any


class NitropingError(Exception):
    """Base error raised by every SDK function.

    Subclasses set :attr:`code` and may add structured fields
    (:attr:`status`, :attr:`details`).
    """

    #: Optional HTTP status if this error originated from a response.
    status: int | None

    #: Stable machine-readable code, mirrored from the server envelope
    #: (``error.code``). Examples: ``"invalid_api_key"``,
    #: ``"validation_failed"``, ``"quota_exceeded"``. SDK-internal failures
    #: use codes like ``"network_error"`` or ``"invalid_signature"``.
    code: str

    #: Free-form details object — typically the server's ``error.details``
    #: (field-level validation errors).
    details: Any

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str = "error",
        details: Any = None,
        cause: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.details = details
        if cause is not None:
            self.__cause__ = cause


class ApiError(NitropingError):
    """Raised when the server returns a non-2xx response.

    Carries the server's ``code``, ``message``, and (for validation
    failures) the per-field ``details`` map.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        code: str = "error",
        details: Any = None,
    ) -> None:
        super().__init__(message, status=status, code=code, details=details)


class NetworkError(NitropingError):
    """Raised when the HTTP transport itself fails.

    Wraps DNS / TLS / offline / abort errors. The underlying exception is
    attached via :attr:`__cause__`.
    """

    def __init__(self, message: str, *, cause: BaseException | None = None) -> None:
        super().__init__(message, code="network_error", cause=cause)


class InvalidSignatureError(NitropingError):
    """Raised by :func:`nitroping.webhooks.verify` when the HMAC does not
    match the request body, or the signature header is malformed."""

    def __init__(
        self, message: str = "Webhook signature does not match request body"
    ) -> None:
        super().__init__(message, code="invalid_signature")


class TimestampOutOfRangeError(NitropingError):
    """Raised by :func:`nitroping.webhooks.verify` when the signature is
    well-formed and matches the body, but its ``t=`` timestamp is outside
    the tolerance window. Defends against signature replay."""

    def __init__(
        self,
        message: str = "Webhook timestamp is outside the allowed tolerance",
    ) -> None:
        super().__init__(message, code="timestamp_out_of_range")


class MissingSignatureHeaderError(NitropingError):
    """Raised by :func:`nitroping.webhooks.verify` when the
    ``X-Nitroping-Signature`` header is absent."""

    def __init__(
        self, message: str = "Missing X-Nitroping-Signature header"
    ) -> None:
        super().__init__(message, code="missing_signature_header")
