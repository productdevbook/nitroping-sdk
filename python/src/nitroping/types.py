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


class TargetTags(TypedDict):
    """Hit every device row tagged with one of the given tags."""

    tags: list[str]


#: Comparison operator for a :class:`SegmentCondition`.
SegmentOp = Literal["eq", "neq", "in", "exists", "contains", "gt", "lt"]


class _SegmentConditionBase(TypedDict):
    #: One of ``platform`` / ``user_id`` / ``timezone`` / ``tag`` /
    #: ``metadata.<key>``.
    field: str
    op: SegmentOp


class SegmentCondition(_SegmentConditionBase, total=False):
    """A single audience-segment condition over device fields + metadata."""

    #: String, number, or list depending on ``op`` (omit for ``exists``).
    value: str | int | float | list[str | int | float]


class _SegmentBase(TypedDict):
    conditions: list[SegmentCondition]


class Segment(_SegmentBase, total=False):
    """Audience segment — match devices by a list of conditions.

    ``match`` is AND (``"all"``, default) or OR (``"any"``) over the
    conditions. When omitted the SDK applies ``"all"`` before sending.
    """

    match: Literal["all", "any"]


class TargetSegment(TypedDict):
    """Hit every device row matching the given audience segment."""

    segment: Segment


#: Target selector for a notification. Exactly one of the five.
NotificationTarget = (
    TargetAll | TargetDeviceIds | TargetUserIds | TargetTags | TargetSegment
)


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


class UpdateDeviceResult(TypedDict):
    """Response from ``PUT /api/v1/devices/:id``."""

    #: UUID of the device row.
    id: str
    #: The device's tags after the update.
    tags: list[str]


class DeactivateDeviceResult(TypedDict):
    """Response from ``DELETE /api/v1/devices/:id``."""

    id: str
    status: str


class CancelNotificationResult(TypedDict):
    """Response from ``DELETE /api/v1/notifications/:id``."""

    id: str
    status: str


#: Delivery-tracking event type for ``POST /api/v1/track``.
TrackEvent = Literal["delivered", "opened", "clicked"]

#: Engagement event type for ``POST /api/v1/events``.
EngagementEvent = Literal["opened", "clicked"]


class TrackResult(TypedDict):
    """Response from ``POST /api/v1/track``."""

    accepted: bool


class ReportEventResult(TypedDict):
    """Response from ``POST /api/v1/events``."""

    accepted: bool


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
