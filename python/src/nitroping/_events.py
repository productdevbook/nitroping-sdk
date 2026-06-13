"""``events`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.events``. Wraps
``POST /api/v1/events`` — the public, unauthenticated engagement
endpoint. The ``(notification_id, device_id)`` pair is the bearer
secret, so no ``Authorization`` header is required (and a ``pk_`` public
key is fine).

This is the endpoint a client app calls when a notification is opened or
a notification action is clicked.
"""

from __future__ import annotations

from typing import Any, cast

from ._http import HttpClient
from .types import EngagementEvent, ReportEventResult


class EventsClient:
    """Report public engagement events (``opened`` / ``clicked``)."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def report(
        self,
        *,
        notification_id: str,
        device_id: str,
        type: EngagementEvent,
        action_id: str | None = None,
        happened_at: str | None = None,
    ) -> ReportEventResult:
        """Report an engagement event (``opened`` or ``clicked``).

        Returns ``{"accepted": True}`` on 202. Raises
        :class:`~nitroping.errors.ApiError` with ``code = "not_found"``
        (404) if the notification/device pair is unknown.
        """
        wire: dict[str, Any] = {
            "notification_id": notification_id,
            "device_id": device_id,
            "type": type,
        }
        if action_id is not None:
            wire["action_id"] = action_id
        if happened_at is not None:
            wire["happened_at"] = happened_at

        response = self._http.request("POST", "/api/v1/events", body=wire)
        return cast(ReportEventResult, response)
