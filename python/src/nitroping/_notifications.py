"""``notifications`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.notifications``. Wraps
``POST /api/v1/notifications`` and ``GET /api/v1/notifications/:id``.
"""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import quote

from ._http import HttpClient
from .types import NotificationAction, NotificationResult, NotificationTarget


class NotificationsClient:
    """Send and inspect notifications."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def send(
        self,
        *,
        target: NotificationTarget,
        title: str | None = None,
        body: str | None = None,
        template: str | None = None,
        vars: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        icon: str | None = None,
        image: str | None = None,
        click_action: str | None = None,
        deep_link: str | None = None,
        actions: list[NotificationAction] | None = None,
        scheduled_at: str | None = None,
        expires_at: str | None = None,
        idempotency_key: str | None = None,
    ) -> NotificationResult:
        """Enqueue a new notification.

        Either ``title + body`` (raw payload) or ``template + vars``
        (Pro plan). Mixing the two is a 422.

        Returns ``{"id": ..., "status": ...}`` on ``201 Created``. On
        non-2xx the SDK raises :class:`~nitroping.errors.ApiError`
        carrying the server's ``code``, ``message``, and (for validation
        failures) the per-field ``details`` map.
        """
        wire: dict[str, Any] = {"target": dict(target)}
        if title is not None:
            wire["title"] = title
        if body is not None:
            wire["body"] = body
        if template is not None:
            wire["template"] = template
        if vars is not None:
            wire["vars"] = vars
        if data is not None:
            wire["data"] = data
        if icon is not None:
            wire["icon"] = icon
        if image is not None:
            wire["image"] = image
        if click_action is not None:
            wire["click_action"] = click_action
        if deep_link is not None:
            wire["deep_link"] = deep_link
        if actions is not None:
            wire["actions"] = actions
        if scheduled_at is not None:
            wire["scheduled_at"] = scheduled_at
        if expires_at is not None:
            wire["expires_at"] = expires_at

        headers: dict[str, str] = {}
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key

        response = self._http.request(
            "POST", "/api/v1/notifications", body=wire, headers=headers
        )
        return cast(NotificationResult, response)

    def get(self, notification_id: str) -> dict[str, Any]:
        """Fetch a previously-enqueued notification by id.

        Returns the full row (including counters: ``total_sent``,
        ``total_delivered``, ``total_failed``, etc.).
        """
        response = self._http.request(
            "GET", f"/api/v1/notifications/{quote(notification_id, safe='')}"
        )
        return cast(dict[str, Any], response)
