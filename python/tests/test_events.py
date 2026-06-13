"""Tests for ``np.events`` — mirrors js/test/events.test.ts."""

from __future__ import annotations

import pytest

from nitroping import ApiError, AsyncNitroping, Nitroping


def test_report_opened(mock_urlopen):
    """events.report(...) → POST /api/v1/events with snake_case body."""
    mock_urlopen.enqueue_json(202, {"accepted": True})

    np = Nitroping(api_key="np_x")
    result = np.events.report(
        notification_id="n1",
        device_id="d1",
        type="opened",
    )

    assert result == {"accepted": True}
    call = mock_urlopen.calls[0]
    assert call.method == "POST"
    assert call.url == "https://nitroping.dev/api/v1/events"
    assert call.body_json == {
        "notification_id": "n1",
        "device_id": "d1",
        "type": "opened",
    }


def test_report_clicked_with_action_and_timestamp(mock_urlopen):
    """Optional action_id / happened_at forwarded as snake_case fields."""
    mock_urlopen.enqueue_json(202, {"accepted": True})

    np = Nitroping(api_key="np_x")
    np.events.report(
        notification_id="n1",
        device_id="d1",
        type="clicked",
        action_id="track",
        happened_at="2026-06-13T10:00:00Z",
    )

    assert mock_urlopen.calls[0].body_json == {
        "notification_id": "n1",
        "device_id": "d1",
        "type": "clicked",
        "action_id": "track",
        "happened_at": "2026-06-13T10:00:00Z",
    }


def test_report_404_raises_apierror(mock_urlopen):
    """Unknown notification/device pair → ApiError with not_found code."""
    mock_urlopen.enqueue_error(
        404,
        {"error": {"code": "not_found", "message": "Unknown pair"}},
    )

    np = Nitroping(api_key="np_x")
    with pytest.raises(ApiError) as exc:
        np.events.report(notification_id="n1", device_id="d1", type="opened")
    assert exc.value.code == "not_found"
    assert exc.value.status == 404


async def test_async_events_report(mock_urlopen):
    """AsyncNitroping.events.report awaits and returns the same result."""
    mock_urlopen.enqueue_json(202, {"accepted": True})

    np = AsyncNitroping(api_key="np_x")
    result = await np.events.report(
        notification_id="n1",
        device_id="d1",
        type="opened",
    )

    assert result == {"accepted": True}
    assert mock_urlopen.calls[0].url == "https://nitroping.dev/api/v1/events"
