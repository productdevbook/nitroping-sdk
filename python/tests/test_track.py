"""Tests for ``np.track`` — mirrors js/test/track.test.ts."""

from __future__ import annotations

import pytest

from nitroping import Nitroping, NitropingError


def test_record_by_delivery_log_id(mock_urlopen):
    """track.record(delivery_log_id=..., event=...) → POST /api/v1/track."""
    mock_urlopen.enqueue_json(202, {"accepted": True})

    np = Nitroping(api_key="np_x")
    result = np.track.record(delivery_log_id="dl-1", event="delivered")

    assert result == {"accepted": True}
    call = mock_urlopen.calls[0]
    assert call.method == "POST"
    assert call.url == "https://nitroping.dev/api/v1/track"
    assert call.body_json == {"delivery_log_id": "dl-1", "event": "delivered"}


def test_record_by_notification_and_device_token(mock_urlopen):
    """The alternative shape: notification_id + device_token."""
    mock_urlopen.enqueue_json(202, {"accepted": True})

    np = Nitroping(api_key="np_x")
    result = np.track.record(
        notification_id="n1",
        device_token="apns-abc",
        event="opened",
    )

    assert result == {"accepted": True}
    assert mock_urlopen.calls[0].body_json == {
        "notification_id": "n1",
        "device_token": "apns-abc",
        "event": "opened",
    }


def test_record_requires_an_identifier(mock_urlopen):
    """Missing both identifiers raises NitropingError, no HTTP call made."""
    np = Nitroping(api_key="np_x")
    with pytest.raises(NitropingError) as exc:
        np.track.record(event="clicked")
    assert exc.value.code == "invalid_argument"
    assert mock_urlopen.calls == []
