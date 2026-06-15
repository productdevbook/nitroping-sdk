"""Tests for ``np.devices`` — mirrors js/test/devices.test.ts."""

from __future__ import annotations

import pytest

from nitroping import ApiError, Nitroping


def test_register_ios_with_user_id_and_metadata(mock_urlopen):
    """POST /api/v1/devices with snake_case body, Authorization header."""
    mock_urlopen.enqueue_json(201, {"id": "dev-1", "created": True})

    np = Nitroping(api_key="np_x")
    result = np.devices.register(
        platform="ios",
        token="apns-token-abc",
        user_id="user-42",
        metadata={"source": "tests"},
    )

    assert result == {"id": "dev-1", "created": True}

    call = mock_urlopen.calls[0]
    assert call.method == "POST"
    assert call.url == "https://nitroping.dev/api/v1/devices"
    assert call.headers["Authorization"] == "ApiKey np_x"
    assert call.body_json == {
        "platform": "ios",
        "token": "apns-token-abc",
        "user_id": "user-42",
        "metadata": {"source": "tests"},
    }


def test_register_web_with_p256dh_and_auth(mock_urlopen):
    """Web Push fields land on the wire as web_push_p256dh / web_push_auth."""
    mock_urlopen.enqueue_json(200, {"id": "dev-2", "created": False})

    np = Nitroping(api_key="np_x")
    result = np.devices.register(
        platform="web",
        token="https://fcm.googleapis.com/abc",
        web_push_p256dh="BPS_p256dh_value",
        web_push_auth="auth_secret_value",
    )

    assert result["created"] is False
    body = mock_urlopen.calls[0].body_json
    assert body is not None
    assert body["web_push_p256dh"] == "BPS_p256dh_value"
    assert body["web_push_auth"] == "auth_secret_value"


def test_register_with_tags(mock_urlopen):
    """tags kwarg lands on the wire as a `tags` array."""
    mock_urlopen.enqueue_json(201, {"id": "dev-3", "created": True})

    np = Nitroping(api_key="np_x")
    np.devices.register(
        platform="android",
        token="fcm-token-xyz",
        tags=["beta", "vip"],
    )

    body = mock_urlopen.calls[0].body_json
    assert body is not None
    assert body["tags"] == ["beta", "vip"]


def test_register_with_timezone(mock_urlopen):
    """timezone kwarg lands on the wire as a `timezone` field."""
    mock_urlopen.enqueue_json(201, {"id": "dev-4", "created": True})

    np = Nitroping(api_key="np_x")
    np.devices.register(
        platform="ios",
        token="apns-token",
        timezone="Europe/Istanbul",
    )

    body = mock_urlopen.calls[0].body_json
    assert body is not None
    assert body["timezone"] == "Europe/Istanbul"


def test_update_sends_put_with_tags(mock_urlopen):
    """PUT /api/v1/devices/:id with {tags:[...]}, returns {id, tags}."""
    mock_urlopen.enqueue_json(200, {"id": "dev-1", "tags": ["beta"]})

    np = Nitroping(api_key="np_x")
    result = np.devices.update("dev-1", tags=["beta"])

    assert result == {"id": "dev-1", "tags": ["beta"]}
    call = mock_urlopen.calls[0]
    assert call.method == "PUT"
    assert call.url == "https://nitroping.dev/api/v1/devices/dev-1"
    assert call.body_json == {"tags": ["beta"]}


def test_deactivate_sends_delete(mock_urlopen):
    """DELETE /api/v1/devices/:id with proper URL-encoded id."""
    mock_urlopen.enqueue_json(200, {"id": "dev-1", "status": "inactive"})

    np = Nitroping(api_key="np_x")
    result = np.devices.deactivate("dev-1")

    assert result == {"id": "dev-1", "status": "inactive"}
    assert mock_urlopen.calls[0].url == "https://nitroping.dev/api/v1/devices/dev-1"
    assert mock_urlopen.calls[0].method == "DELETE"


def test_deactivate_404_raises_apierror(mock_urlopen):
    """404 with `not_found` code is surfaced as ApiError."""
    mock_urlopen.enqueue_error(
        404,
        {"error": {"code": "not_found", "message": "Device not found"}},
    )

    np = Nitroping(api_key="np_x")
    with pytest.raises(ApiError) as exc:
        np.devices.deactivate("missing")
    assert exc.value.code == "not_found"
    assert exc.value.status == 404


def test_list_sends_get_with_snake_case_query_and_maps_rows(mock_urlopen):
    """GET /api/v1/devices with snake_case query params, mapped {data, total}."""
    mock_urlopen.enqueue_json(
        200,
        {
            "data": [
                {
                    "id": "dev-1",
                    "user_id": "alice",
                    "platform": "ios",
                    "status": "active",
                    "tags": ["vip"],
                    "timezone": "Europe/Istanbul",
                    "apns_environment": "production",
                    "last_seen_at": "2026-06-15T00:00:00Z",
                    "inserted_at": "2026-06-14T00:00:00Z",
                }
            ],
            "total": 1,
        },
    )

    np = Nitroping(api_key="np_x")
    res = np.devices.list(user_id="alice", platform="ios", page_size=10)

    assert res["total"] == 1
    assert res["data"][0] == {
        "id": "dev-1",
        "user_id": "alice",
        "platform": "ios",
        "status": "active",
        "tags": ["vip"],
        "timezone": "Europe/Istanbul",
        "apns_environment": "production",
        "last_seen_at": "2026-06-15T00:00:00Z",
        "inserted_at": "2026-06-14T00:00:00Z",
    }

    call = mock_urlopen.calls[0]
    assert call.method == "GET"
    assert call.url.startswith("https://nitroping.dev/api/v1/devices?")
    assert "user_id=alice" in call.url
    assert "platform=ios" in call.url
    assert "page_size=10" in call.url


def test_list_never_exposes_token(mock_urlopen):
    """The listing type carries no token, even if the server leaked one."""
    mock_urlopen.enqueue_json(
        200,
        {
            "data": [
                {
                    "id": "dev-1",
                    "user_id": None,
                    "platform": "android",
                    "status": "active",
                    "tags": [],
                    "timezone": None,
                    "apns_environment": None,
                    "last_seen_at": None,
                    "inserted_at": "2026-06-14T00:00:00Z",
                    # Hypothetical server leak — must not survive mapping.
                    "token": "should-not-appear",
                }
            ],
            "total": 1,
        },
    )

    np = Nitroping(api_key="np_x")
    res = np.devices.list()

    assert "token" not in res["data"][0]


def test_list_empty(mock_urlopen):
    """An empty listing maps to {data: [], total: 0}."""
    mock_urlopen.enqueue_json(200, {"data": [], "total": 0})

    np = Nitroping(api_key="np_x")
    res = np.devices.list()

    assert res == {"data": [], "total": 0}


def test_deactivate_by_token_sends_delete_with_token_body(mock_urlopen):
    """DELETE /api/v1/devices with a {token} body, returns {id, status}."""
    mock_urlopen.enqueue_json(200, {"id": "dev-9", "status": "inactive"})

    np = Nitroping(api_key="np_x")
    result = np.devices.deactivate_by_token("apns-token-xyz")

    assert result == {"id": "dev-9", "status": "inactive"}
    call = mock_urlopen.calls[0]
    assert call.method == "DELETE"
    assert call.url == "https://nitroping.dev/api/v1/devices"
    assert call.body_json == {"token": "apns-token-xyz"}


def test_deactivate_by_token_404_raises_not_found(mock_urlopen):
    """No device with that token → 404 ApiError with code not_found."""
    mock_urlopen.enqueue_error(
        404,
        {"error": {"code": "not_found", "message": "Device not found"}},
    )

    np = Nitroping(api_key="np_x")
    with pytest.raises(ApiError) as exc:
        np.devices.deactivate_by_token("nope")
    assert exc.value.code == "not_found"
    assert exc.value.status == 404
