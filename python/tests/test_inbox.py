"""Tests for ``np.inbox`` — mirrors js/test/inbox.test.ts."""

from __future__ import annotations

from nitroping import Nitroping


def test_list_sends_query_params_and_returns_items(mock_urlopen):
    """inbox.list(...) → GET /api/v1/public/inbox with query params,
    returns the items array."""
    mock_urlopen.enqueue_json(
        200,
        {
            "items": [
                {
                    "id": "i1",
                    "notification_id": "n1",
                    "title": "Hi",
                    "body": "there",
                    "read": False,
                }
            ]
        },
    )

    np = Nitroping(api_key="pk_x")
    items = np.inbox.list("user-1", unread_only=True, limit=10)

    assert items == [
        {
            "id": "i1",
            "notification_id": "n1",
            "title": "Hi",
            "body": "there",
            "read": False,
        }
    ]
    url = mock_urlopen.calls[0].url
    assert url.startswith("https://nitroping.dev/api/v1/public/inbox?")
    assert "user_id=user-1" in url
    assert "unread_only=True" in url
    assert "limit=10" in url
    assert mock_urlopen.calls[0].method == "GET"


def test_list_returns_empty_when_no_items(mock_urlopen):
    """A missing/empty items array yields []."""
    mock_urlopen.enqueue_json(200, {})

    np = Nitroping(api_key="pk_x")
    assert np.inbox.list("u1") == []
    assert mock_urlopen.calls[0].url == (
        "https://nitroping.dev/api/v1/public/inbox?user_id=u1"
    )


def test_unread_count_returns_number(mock_urlopen):
    """inbox.unread_count(...) → GET .../unread_count, returns the int."""
    mock_urlopen.enqueue_json(200, {"unread_count": 7})

    np = Nitroping(api_key="pk_x")
    assert np.inbox.unread_count("u1") == 7
    assert mock_urlopen.calls[0].url == (
        "https://nitroping.dev/api/v1/public/inbox/unread_count?user_id=u1"
    )


def test_mark_read_posts_user_id(mock_urlopen):
    """inbox.mark_read(...) → POST .../:id/read with {user_id}."""
    mock_urlopen.enqueue_json(
        200, {"id": "i1", "notification_id": "n1", "read": True}
    )

    np = Nitroping(api_key="pk_x")
    item = np.inbox.mark_read("u1", "i1")

    call = mock_urlopen.calls[0]
    assert call.method == "POST"
    assert call.url == "https://nitroping.dev/api/v1/public/inbox/i1/read"
    assert call.body_json == {"user_id": "u1"}
    assert item["read"] is True


def test_mark_all_read_returns_count(mock_urlopen):
    """inbox.mark_all_read(...) → POST .../read_all, returns marked_read."""
    mock_urlopen.enqueue_json(200, {"marked_read": 3})

    np = Nitroping(api_key="pk_x")
    assert np.inbox.mark_all_read("u1") == 3
    call = mock_urlopen.calls[0]
    assert call.method == "POST"
    assert call.url == "https://nitroping.dev/api/v1/public/inbox/read_all"
    assert call.body_json == {"user_id": "u1"}
