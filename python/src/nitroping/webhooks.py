"""Verify outbound webhook signatures.

The nitroping server signs every outbound webhook with HMAC-SHA256 and
ships the result in the ``X-Nitroping-Signature`` header. The header
format mirrors Polar / Stripe::

    X-Nitroping-Signature: t=1700000000, v1=<hex>

where ``v1 = HMAC-SHA256(secret, "<unix>.<raw body>")``.

Example::

    from nitroping.webhooks import verify

    event = verify(
        body=raw_body_bytes,
        signature=request.headers["x-nitroping-signature"],
        secret=os.environ["NITROPING_WEBHOOK_SECRET"],
    )
    if event["type"] == "notification.delivered":
        ...

Zero deps — :mod:`hmac` and :mod:`hashlib` from the stdlib.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
from typing import cast

from .errors import (
    InvalidSignatureError,
    MissingSignatureHeaderError,
    NitropingError,
    TimestampOutOfRangeError,
)
from .types import WebhookEvent

__all__ = ["sign", "verify"]

_HEX_RE = re.compile(r"^[0-9a-f]+$", re.IGNORECASE)


def verify(
    *,
    body: bytes | str,
    signature: str | None,
    secret: str,
    tolerance: int = 300,
    now: int | float | None = None,
) -> WebhookEvent:
    """Verify and parse a webhook delivery.

    :param body: Raw request body, exactly as received (do **not**
        re-serialize a parsed JSON object — whitespace and key order
        matter to the HMAC).
    :param signature: The ``X-Nitroping-Signature`` header value, or
        ``None`` if the header was missing.
    :param secret: Webhook signing secret, configured in the app panel.
    :param tolerance: Maximum drift between ``t=`` and the verifier's
        wall clock, in seconds. Default: 300 (five minutes). Set lower
        for stricter replay defense.
    :param now: Override "now" — useful for tests and replaying a saved
        request during incident investigation. Unix seconds.

    :returns: The parsed :class:`~nitroping.types.WebhookEvent`.

    :raises MissingSignatureHeaderError: ``signature`` was ``None``.
    :raises InvalidSignatureError: header malformed or HMAC mismatch.
    :raises TimestampOutOfRangeError: signature valid but ``t=`` outside
        the tolerance window.
    :raises NitropingError: body wasn't valid JSON (``code = "invalid_body"``).
    """
    if signature is None:
        raise MissingSignatureHeaderError()

    parsed = _parse_signature_header(signature)
    if parsed is None:
        raise InvalidSignatureError("Malformed X-Nitroping-Signature header")
    t, v1 = parsed

    raw_body: bytes
    raw_body_str: str
    if isinstance(body, bytes):
        raw_body = body
        raw_body_str = body.decode("utf-8", errors="replace")
    else:
        raw_body_str = body
        raw_body = body.encode()

    expected = _hmac_sha256_hex(secret, f"{t}.".encode() + raw_body)

    # Constant-time compare via hmac.compare_digest. Both inputs are
    # lowercase hex of the same length when the header is well-formed;
    # if the lengths differ compare_digest still runs in constant time
    # for the length of the shorter input.
    if not hmac.compare_digest(expected, v1):
        raise InvalidSignatureError()

    current = int(time.time()) if now is None else int(now)
    if abs(current - t) > tolerance:
        raise TimestampOutOfRangeError(
            f"Webhook timestamp {t} is more than {tolerance}s from now ({current})"
        )

    try:
        event = json.loads(raw_body_str)
    except json.JSONDecodeError as cause:
        raise NitropingError(
            "Webhook body is not valid JSON",
            code="invalid_body",
            cause=cause,
        ) from cause

    return cast(WebhookEvent, event)


def sign(secret: str, body: bytes | str, timestamp: int | float | None = None) -> str:
    """Compute a header value for the nitroping signing scheme.

    Mostly useful for tests; production code should rely on the server.
    """
    t = int(time.time()) if timestamp is None else int(timestamp)
    body_bytes = body.encode("utf-8") if isinstance(body, str) else body
    v1 = _hmac_sha256_hex(secret, f"{t}.".encode() + body_bytes)
    return f"t={t}, v1={v1}"


def _parse_signature_header(header: str) -> tuple[int, str] | None:
    """Parse ``t=<unix>, v1=<hex>``. Tolerant of extra whitespace and
    ordering — match by key. Returns ``None`` on malformed input."""
    parts = [piece.strip() for piece in header.split(",")]
    t: int | None = None
    v1: str | None = None
    for part in parts:
        eq = part.find("=")
        if eq <= 0:
            continue
        key = part[:eq].strip()
        value = part[eq + 1 :].strip()
        if key == "t":
            try:
                t = int(value)
            except ValueError:
                return None
        elif key == "v1":
            if not _HEX_RE.match(value):
                return None
            v1 = value.lower()
    if t is None or v1 is None:
        return None
    return t, v1


def _hmac_sha256_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
