"""``inbox`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.inbox``. Wraps the in-app
notification center under ``/api/v1/public/inbox``. These endpoints
authenticate with a **public** (``pk_``) key — they're meant to be called
from a client app on behalf of a signed-in end user, identified by
``user_id`` (the same opaque id you pass at device registration).
"""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import quote

from ._http import HttpClient


class InboxClient:
    """List and mark-read a user's in-app notification center."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def list(
        self,
        user_id: str,
        *,
        unread_only: bool | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """List a user's inbox, newest first.

        Wraps ``GET /api/v1/public/inbox``. ``unread_only`` filters to
        unread items; ``limit`` caps the result (the server caps at 200).
        Returns the ``items`` array.
        """
        params: dict[str, Any] = {"user_id": user_id}
        if unread_only is not None:
            params["unread_only"] = unread_only
        if limit is not None:
            params["limit"] = limit

        response = self._http.request("GET", "/api/v1/public/inbox", params=params)
        items = response.get("items") if isinstance(response, dict) else None
        return cast("list[dict[str, Any]]", items or [])

    def unread_count(self, user_id: str) -> int:
        """Count a user's unread inbox items.

        Wraps ``GET /api/v1/public/inbox/unread_count``. Returns the
        ``unread_count`` integer.
        """
        response = self._http.request(
            "GET",
            "/api/v1/public/inbox/unread_count",
            params={"user_id": user_id},
        )
        count = response.get("unread_count") if isinstance(response, dict) else None
        return cast(int, count or 0)

    def mark_read(self, user_id: str, item_id: str) -> dict[str, Any]:
        """Mark a single inbox item read.

        Wraps ``POST /api/v1/public/inbox/:id/read``. Returns the updated
        item row.
        """
        response = self._http.request(
            "POST",
            f"/api/v1/public/inbox/{quote(item_id, safe='')}/read",
            body={"user_id": user_id},
        )
        return cast("dict[str, Any]", response)

    def mark_all_read(self, user_id: str) -> int:
        """Mark every unread inbox item read for a user.

        Wraps ``POST /api/v1/public/inbox/read_all``. Returns the
        ``marked_read`` count.
        """
        response = self._http.request(
            "POST",
            "/api/v1/public/inbox/read_all",
            body={"user_id": user_id},
        )
        marked = response.get("marked_read") if isinstance(response, dict) else None
        return cast(int, marked or 0)
