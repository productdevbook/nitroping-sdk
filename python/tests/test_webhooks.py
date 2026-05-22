"""Tests for ``nitroping.webhooks.verify`` — mirrors js/test/webhooks.test.ts.

Includes the locked-in HMAC vector from the JS test suite. If this test
breaks, the Python impl has drifted from the Elixir server and the JS
SDK.
"""

from __future__ import annotations

import json

import pytest

from nitroping.errors import (
    InvalidSignatureError,
    MissingSignatureHeaderError,
    NitropingError,
    TimestampOutOfRangeError,
)
from nitroping.webhooks import sign, verify

SECRET = "whsec_test_0123456789abcdef"


def _fixture(body: str, t: int, secret: str = SECRET) -> tuple[str, str]:
    return body, sign(secret, body, t)


def test_verify_accepts_valid_signature_and_returns_event():
    event = {
        "id": "evt_abc",
        "type": "notification.delivered",
        "created_at": "2026-05-22T10:00:00Z",
        "data": {"notification_id": "n1"},
    }
    t = 1_700_000_000
    body, header = _fixture(json.dumps(event), t)

    result = verify(body=body, signature=header, secret=SECRET, now=t)
    assert result == event


def test_sign_format_matches_server():
    """sign() returns ``t=<unix>, v1=<hex>`` (matches Stripe / Polar style)."""
    header = sign(SECRET, "{}", 1_700_000_000)
    assert header.startswith("t=1700000000, v1=")
    # Header value is exactly: "t=<digits>, v1=<lowercase hex>".
    _, hex_part = header.split("v1=", 1)
    assert all(c in "0123456789abcdef" for c in hex_part)


def test_verify_rejects_tampered_body():
    t = 1_700_000_000
    _, header = _fixture(json.dumps({"ok": True}), t)
    with pytest.raises(InvalidSignatureError):
        verify(
            body=json.dumps({"ok": False}),  # tampered
            signature=header,
            secret=SECRET,
            now=t,
        )


def test_verify_rejects_wrong_secret():
    t = 1_700_000_000
    body, header = _fixture(json.dumps({"ok": True}), t)
    with pytest.raises(InvalidSignatureError):
        verify(body=body, signature=header, secret="whsec_wrong", now=t)


def test_verify_rejects_old_timestamp():
    signed_at = 1_700_000_000
    body, header = _fixture(json.dumps({"ok": True}), signed_at)
    with pytest.raises(TimestampOutOfRangeError):
        verify(
            body=body,
            signature=header,
            secret=SECRET,
            now=signed_at + 1000,  # 1000s drift, default tolerance 300
        )


def test_verify_wider_tolerance_accepts_drift():
    signed_at = 1_700_000_000
    body, header = _fixture(json.dumps({"x": 1}), signed_at)
    result = verify(
        body=body,
        signature=header,
        secret=SECRET,
        now=signed_at + 86_400,
        tolerance=90_000,
    )
    assert result == {"x": 1}


def test_verify_missing_header_raises():
    with pytest.raises(MissingSignatureHeaderError):
        verify(body="{}", signature=None, secret=SECRET)


def test_verify_malformed_header_raises_invalid_signature():
    with pytest.raises(InvalidSignatureError):
        verify(body="{}", signature="not-a-real-header", secret=SECRET)


def test_verify_non_json_body_raises_nitroping_error():
    t = 1_700_000_000
    _, header = _fixture("not-json", t)
    with pytest.raises(NitropingError) as exc:
        verify(body="not-json", signature=header, secret=SECRET, now=t)
    # Must not be a more specific subclass — this is the catch-all path.
    assert type(exc.value) is NitropingError
    assert exc.value.code == "invalid_body"


def test_verify_accepts_bytes_body():
    """Bytes input is hashed identically to its UTF-8 string form."""
    t = 1_700_000_000
    body_str = json.dumps({"hello": "world"})
    body_bytes = body_str.encode("utf-8")
    header = sign(SECRET, body_bytes, t)

    result = verify(body=body_bytes, signature=header, secret=SECRET, now=t)
    assert result == {"hello": "world"}

    # And the same sig works against the string form.
    result2 = verify(body=body_str, signature=header, secret=SECRET, now=t)
    assert result2 == {"hello": "world"}


def test_verify_constant_time_compare_smoke():
    """Sanity: identical hex strings of mismatched length never match."""
    t = 1_700_000_000
    body = "{}"
    _, header = _fixture(body, t)
    # Truncate the signature — different length → still InvalidSignatureError.
    truncated = header[: header.index("v1=") + 5]
    with pytest.raises(InvalidSignatureError):
        verify(body=body, signature=truncated, secret=SECRET, now=t)


def test_verify_matches_elixir_server_reference_hmac():
    """Locked-in vector, copied verbatim from js/test/webhooks.test.ts.

    Computed on the Elixir server side via:

        iex> :crypto.mac(:hmac, :sha256, "0123456789abcdef",
        ...>             "1700000000.{\\"hello\\":\\"world\\"}")
        ...> |> Base.encode16(case: :lower)

    If this test breaks, the Python impl has drifted from the JS SDK
    and the Elixir server. Do **not** "fix" it by recomputing — fix the
    impl.
    """
    secret = "0123456789abcdef"
    body = '{"hello":"world"}'
    t = 1_700_000_000

    header = sign(secret, body, t)
    assert header == (
        "t=1700000000, v1=66997eb7c1d13335f141deda66669e544a2c7f62745300308aec8f7042fb18be"
    )

    result = verify(body=body, signature=header, secret=secret, now=t)
    assert result == {"hello": "world"}
