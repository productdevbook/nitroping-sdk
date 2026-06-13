"""Tests for opt-in debug logging on the HTTP client."""

from __future__ import annotations

from urllib.error import URLError

import pytest

from nitroping import NetworkError, Nitroping


def test_debug_callable_receives_request_and_response_events(mock_urlopen):
    """A callable debug sink gets a request event then a response event;
    the api key is never present in any event."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    events: list[dict] = []
    np = Nitroping(api_key="np_secret", debug=events.append)
    np.notifications.send(title="x", body="y", target={"all": True})

    phases = [e["phase"] for e in events]
    assert phases == ["request", "response"]

    request_event = events[0]
    assert request_event["method"] == "POST"
    assert request_event["url"] == "https://nitroping.dev/api/v1/notifications"
    # Authorization must be redacted; the key must not leak anywhere.
    assert request_event["headers"]["Authorization"] == "[redacted]"
    blob = repr(events)
    assert "np_secret" not in blob

    assert events[1]["status"] == 201


def test_debug_callable_receives_error_event(mock_urlopen):
    """Transport failure emits an `error` phase event."""
    mock_urlopen.enqueue_raw_error(URLError("offline"))

    events: list[dict] = []
    np = Nitroping(api_key="np_secret", debug=events.append)
    with pytest.raises(NetworkError):
        np.notifications.send(title="x", body="y", target={"all": True})

    assert [e["phase"] for e in events] == ["request", "error"]
    assert "np_secret" not in repr(events)


def test_debug_true_does_not_raise(mock_urlopen):
    """debug=True routes to the stdlib logger without error."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x", debug=True)
    np.notifications.send(title="x", body="y", target={"all": True})


def test_debug_off_by_default(mock_urlopen):
    """No debug arg → no debug sink configured."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(title="x", body="y", target={"all": True})
    assert np.http._debug is None
