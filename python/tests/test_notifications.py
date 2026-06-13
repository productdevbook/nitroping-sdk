"""Tests for ``np.notifications`` — mirrors js/test/notifications.test.ts."""

from __future__ import annotations

import os
from unittest.mock import patch
from urllib.error import URLError

import pytest

from nitroping import (
    ApiError,
    NetworkError,
    Nitroping,
    NitropingError,
)


def test_constructor_raises_without_api_key():
    """No api_key arg + no NITROPING_API_KEY env var → NitropingError."""
    env = {k: v for k, v in os.environ.items() if k != "NITROPING_API_KEY"}
    with patch.dict(os.environ, env, clear=True), pytest.raises(NitropingError) as exc:
        Nitroping()
    assert exc.value.code == "invalid_argument"


def test_constructor_reads_env_var():
    """api_key falls back to NITROPING_API_KEY."""
    with patch.dict(os.environ, {"NITROPING_API_KEY": "np_env_test_key"}):
        np = Nitroping()
        assert np.http.api_key == "np_env_test_key"


def test_send_posts_correct_headers_and_body(mock_urlopen):
    """The happy path: correct URL, method, headers, snake_case body,
    parsed NotificationResult on the way back."""
    mock_urlopen.enqueue_json(201, {"id": "abc-123", "status": "queued"})

    np = Nitroping(api_key="np_test_secret")
    result = np.notifications.send(
        title="Order #4129 shipped",
        body="On its way",
        deep_link="https://example.com/orders/4129",
        actions=[{"id": "track", "title": "Track"}],
        target={"all": True},
    )

    assert result == {"id": "abc-123", "status": "queued"}

    assert len(mock_urlopen.calls) == 1
    call = mock_urlopen.calls[0]
    assert call.url == "https://nitroping.dev/api/v1/notifications"
    assert call.method == "POST"
    assert call.headers["Authorization"] == "ApiKey np_test_secret"
    assert call.headers["Content-type"] == "application/json"
    assert call.headers["Accept"] == "application/json"

    assert call.body_json == {
        "title": "Order #4129 shipped",
        "body": "On its way",
        "deep_link": "https://example.com/orders/4129",
        "actions": [{"id": "track", "title": "Track"}],
        "target": {"all": True},
    }


def test_send_forwards_idempotency_key(mock_urlopen):
    """idempotency_key kwarg → Idempotency-Key header on the wire."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="Hi",
        body="There",
        target={"user_ids": ["u1"]},
        idempotency_key="order-shipped-4129",
    )

    call = mock_urlopen.calls[0]
    assert call.headers["Idempotency-key"] == "order-shipped-4129"
    assert call.body_json is not None
    assert call.body_json["target"] == {"user_ids": ["u1"]}


def test_send_raises_apierror_on_422_with_details(mock_urlopen):
    """422 envelope is mapped to ApiError(status, code, message, details)."""
    mock_urlopen.enqueue_error(
        422,
        {
            "error": {
                "code": "validation_failed",
                "message": "Request body failed validation",
                "details": {"title": ["can't be blank"]},
            }
        },
    )

    np = Nitroping(api_key="np_x")

    with pytest.raises(ApiError) as exc:
        np.notifications.send(body="", target={"all": True})

    err = exc.value
    assert err.status == 422
    assert err.code == "validation_failed"
    assert str(err) == "Request body failed validation"
    assert err.details == {"title": ["can't be blank"]}


def test_send_network_failure_raises_network_error(mock_urlopen):
    """When urlopen blows up with URLError → NetworkError with cause."""
    mock_urlopen.enqueue_raw_error(URLError("nodename nor servname provided"))

    np = Nitroping(api_key="np_x")

    with pytest.raises(NetworkError) as exc:
        np.notifications.send(title="x", body="y", target={"all": True})

    assert exc.value.code == "network_error"
    assert isinstance(exc.value.__cause__, URLError)


def test_send_supports_custom_base_url(mock_urlopen):
    """Custom base_url is honored (trailing slash stripped)."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x", base_url="https://staging.nitroping.dev/")
    np.notifications.send(title="x", body="y", target={"all": True})

    assert mock_urlopen.calls[0].url == "https://staging.nitroping.dev/api/v1/notifications"


def test_send_target_device_ids(mock_urlopen):
    """target={'device_ids': [...]} passes through unchanged."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="x",
        body="y",
        target={"device_ids": ["d1", "d2"]},
    )

    assert mock_urlopen.calls[0].body_json is not None
    assert mock_urlopen.calls[0].body_json["target"] == {"device_ids": ["d1", "d2"]}


def test_send_target_tags(mock_urlopen):
    """target={'tags': [...]} passes through unchanged on the wire."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="x",
        body="y",
        target={"tags": ["beta", "vip"]},
    )

    assert mock_urlopen.calls[0].body_json is not None
    assert mock_urlopen.calls[0].body_json["target"] == {"tags": ["beta", "vip"]}


def test_send_target_segment_defaults_match_all(mock_urlopen):
    """target={'segment': {...}} without match → match defaults to 'all'."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="x",
        body="y",
        target={
            "segment": {
                "conditions": [
                    {"field": "platform", "op": "eq", "value": "ios"}
                ]
            }
        },
    )

    assert mock_urlopen.calls[0].body_json is not None
    assert mock_urlopen.calls[0].body_json["target"] == {
        "segment": {
            "match": "all",
            "conditions": [{"field": "platform", "op": "eq", "value": "ios"}],
        }
    }


def test_send_target_segment_preserves_explicit_match(mock_urlopen):
    """Explicit match='any' is preserved."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="x",
        body="y",
        target={"segment": {"match": "any", "conditions": []}},
    )

    assert mock_urlopen.calls[0].body_json["target"] == {
        "segment": {"match": "any", "conditions": []}
    }


def test_send_forwards_recurrence_and_email_to(mock_urlopen):
    """recurrence/recurrence_tz/recurrence_until/email_to land snake_case."""
    mock_urlopen.enqueue_json(201, {"id": "n1", "status": "queued"})

    np = Nitroping(api_key="np_x")
    np.notifications.send(
        title="x",
        body="y",
        target={"all": True},
        recurrence="0 9 * * 1",
        recurrence_tz="Europe/Istanbul",
        recurrence_until="2026-12-31T00:00:00Z",
        email_to=["a@example.com", "b@example.com"],
    )

    body = mock_urlopen.calls[0].body_json
    assert body["recurrence"] == "0 9 * * 1"
    assert body["recurrence_tz"] == "Europe/Istanbul"
    assert body["recurrence_until"] == "2026-12-31T00:00:00Z"
    assert body["email_to"] == ["a@example.com", "b@example.com"]


def test_cancel_sends_delete(mock_urlopen):
    """np.notifications.cancel(id) → DELETE /api/v1/notifications/<id>."""
    mock_urlopen.enqueue_json(200, {"id": "n1", "status": "canceled"})

    np = Nitroping(api_key="np_x")
    result = np.notifications.cancel("n1")

    assert result == {"id": "n1", "status": "canceled"}
    assert mock_urlopen.calls[0].method == "DELETE"
    assert mock_urlopen.calls[0].url == "https://nitroping.dev/api/v1/notifications/n1"


def test_cancel_409_raises_apierror(mock_urlopen):
    """409 with `cannot_cancel` code is surfaced as ApiError."""
    mock_urlopen.enqueue_error(
        409,
        {"error": {"code": "cannot_cancel", "message": "Already delivered"}},
    )

    np = Nitroping(api_key="np_x")
    with pytest.raises(ApiError) as exc:
        np.notifications.cancel("n1")
    assert exc.value.code == "cannot_cancel"
    assert exc.value.status == 409


def test_get_notification(mock_urlopen):
    """np.notifications.get(id) → GET /api/v1/notifications/<id>."""
    mock_urlopen.enqueue_json(
        200,
        {
            "id": "abc-123",
            "status": "delivered",
            "counters": {"total_sent": 1, "total_delivered": 1},
        },
    )

    np = Nitroping(api_key="np_x")
    row = np.notifications.get("abc-123")

    assert row["counters"] == {"total_sent": 1, "total_delivered": 1}
    assert mock_urlopen.calls[0].method == "GET"
    assert mock_urlopen.calls[0].url == "https://nitroping.dev/api/v1/notifications/abc-123"
