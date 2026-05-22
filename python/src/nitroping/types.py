"""Shared request / response types for the nitroping HTTP API.

The wire shape mirrors ``POST /api/v1/notifications`` on the
nitroping-pro server. Field names are snake_case on the wire; the SDK
accepts the same snake_case names on input so there is no impedance
mismatch with the server.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

#: Supported device platforms.
Platform = Literal["ios", "android", "web"]


class _NotificationActionBase(TypedDict):
    id: str
    title: str


class NotificationAction(_NotificationActionBase, total=False):
    """Action button rendered on the notification (where the platform
    supports it)."""

    icon: str


class TargetAll(TypedDict):
    """Broadcast target — every active device."""

    all: bool


class TargetDeviceIds(TypedDict):
    """Hit specific device rows."""

    device_ids: list[str]


class TargetUserIds(TypedDict):
    """Hit every device row a user owns."""

    user_ids: list[str]


#: Target selector for a notification. Exactly one of the three.
NotificationTarget = TargetAll | TargetDeviceIds | TargetUserIds


class SendOptions(TypedDict, total=False):
    """Per-call overrides for :meth:`NotificationsClient.send`.

    ``idempotency_key`` — if the same key + the same body is sent again
    the server replays the cached response within 24 hours. Same key +
    different body returns a 409 (``idempotency_conflict``). Max 255
    characters.
    """

    idempotency_key: str


class NotificationResult(TypedDict):
    """Response from ``POST /api/v1/notifications``."""

    #: UUID of the notification row.
    id: str
    #: Initial status, usually ``"queued"``.
    status: str


class RegisterDeviceResult(TypedDict):
    """Response from ``POST /api/v1/devices``."""

    #: UUID of the device row.
    id: str
    #: ``True`` if the device was created on this request; ``False`` if it
    #: already existed.
    created: bool


class DeactivateDeviceResult(TypedDict):
    """Response from ``DELETE /api/v1/devices/:id``."""

    id: str
    status: str


class WebhookEvent(TypedDict):
    """Outbound webhook event envelope (parsed from a
    :func:`nitroping.webhooks.verify` call)."""

    #: Event id, prefixed with ``evt_``.
    id: str
    #: Event type, e.g. ``"notification.delivered"``, ``"webhook.test"``.
    type: str
    #: ISO-8601 timestamp set when the event was queued.
    created_at: str
    #: Event-specific payload.
    data: dict[str, Any]
