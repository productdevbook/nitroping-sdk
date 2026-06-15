"""``notifications`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.notifications``. Wraps
``POST /api/v1/notifications`` and ``GET /api/v1/notifications/:id``.
"""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import quote

from ._http import HttpClient
from .types import (
    CancelNotificationResult,
    NotificationAction,
    NotificationResult,
    NotificationTarget,
)


def _target_to_wire(target: NotificationTarget) -> dict[str, Any]:
    """Normalize a target selector for the wire.

    The wire shape is the same snake_case dict the caller passes; the
    only transform is defaulting a segment target's ``match`` to
    ``"all"`` when the caller omits it.
    """
    wire = dict(target)
    segment = wire.get("segment")
    if isinstance(segment, dict):
        normalized = dict(segment)
        normalized.setdefault("match", "all")
        wire["segment"] = normalized
    return wire


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
        apns_category: str | None = None,
        scheduled_at: str | None = None,
        expires_at: str | None = None,
        recurrence: str | None = None,
        recurrence_tz: str | None = None,
        recurrence_until: str | None = None,
        email_to: list[str] | None = None,
        idempotency_key: str | None = None,
    ) -> NotificationResult:
        """Enqueue a new notification.

        Either ``title + body`` (raw payload) or ``template + vars``
        (Pro plan). Mixing the two is a 422.

        ``apns_category`` is iOS only. It sets ``aps.category`` verbatim
        so an app that registered a matching ``UNNotificationCategory``
        renders the action buttons. Overrides the server-minted category
        for this message.

        ``recurrence`` (a 5-field cron string) with optional
        ``recurrence_tz`` and ``recurrence_until`` schedules a repeating
        send. ``email_to`` adds email recipients for the notification.

        Returns ``{"id": ..., "status": ...}`` on ``201 Created``. On
        non-2xx the SDK raises :class:`~nitroping.errors.ApiError`
        carrying the server's ``code``, ``message``, and (for validation
        failures) the per-field ``details`` map.
        """
        wire: dict[str, Any] = {"target": _target_to_wire(target)}
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
        if apns_category is not None:
            wire["apns_category"] = apns_category
        if scheduled_at is not None:
            wire["scheduled_at"] = scheduled_at
        if expires_at is not None:
            wire["expires_at"] = expires_at
        if recurrence is not None:
            wire["recurrence"] = recurrence
        if recurrence_tz is not None:
            wire["recurrence_tz"] = recurrence_tz
        if recurrence_until is not None:
            wire["recurrence_until"] = recurrence_until
        if email_to is not None:
            wire["email_to"] = email_to

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

    def cancel(self, notification_id: str) -> CancelNotificationResult:
        """Cancel a scheduled or in-flight notification.

        Wraps ``DELETE /api/v1/notifications/:id``. Returns
        ``{"id": ..., "status": "canceled"}``. Raises
        :class:`~nitroping.errors.ApiError` with ``code = "cannot_cancel"``
        (409) if the notification already reached a terminal state, or
        ``code = "not_found"`` (404).
        """
        response = self._http.request(
            "DELETE", f"/api/v1/notifications/{quote(notification_id, safe='')}"
        )
        return cast(CancelNotificationResult, response)
