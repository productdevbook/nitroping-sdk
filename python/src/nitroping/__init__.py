"""Zero-dependency Python SDK for `nitroping <https://nitroping.dev>`_.

Send push notifications, register devices, verify webhook signatures.

Quick start::

    from nitroping import Nitroping

    np = Nitroping(api_key="np_live_...")
    np.notifications.send(
        title="Order #4129 shipped",
        body="On its way",
        target={"all": True},
    )

See the project README for the full API reference, framework recipes,
and error table.
"""

from __future__ import annotations

from ._client import AsyncNitroping, Nitroping
from ._devices import DevicesClient
from ._events import EventsClient
from ._http import DEFAULT_BASE_URL, HttpClient
from ._notifications import NotificationsClient
from ._track import TrackClient
from .errors import (
    ApiError,
    InvalidSignatureError,
    MissingSignatureHeaderError,
    NetworkError,
    NitropingError,
    TimestampOutOfRangeError,
)
from .types import (
    CancelNotificationResult,
    DeactivateDeviceResult,
    EngagementEvent,
    NotificationAction,
    NotificationResult,
    NotificationTarget,
    Platform,
    RegisterDeviceResult,
    ReportEventResult,
    SendOptions,
    TargetAll,
    TargetDeviceIds,
    TargetTags,
    TargetUserIds,
    TrackEvent,
    TrackResult,
    UpdateDeviceResult,
    WebhookEvent,
)

__version__ = "0.2.4"

__all__ = [
    "DEFAULT_BASE_URL",
    "ApiError",
    "AsyncNitroping",
    "CancelNotificationResult",
    "DeactivateDeviceResult",
    "DevicesClient",
    "EngagementEvent",
    "EventsClient",
    "HttpClient",
    "InvalidSignatureError",
    "MissingSignatureHeaderError",
    "NetworkError",
    "Nitroping",
    "NitropingError",
    "NotificationAction",
    "NotificationResult",
    "NotificationTarget",
    "NotificationsClient",
    "Platform",
    "RegisterDeviceResult",
    "ReportEventResult",
    "SendOptions",
    "TargetAll",
    "TargetDeviceIds",
    "TargetTags",
    "TargetUserIds",
    "TimestampOutOfRangeError",
    "TrackClient",
    "TrackEvent",
    "TrackResult",
    "UpdateDeviceResult",
    "WebhookEvent",
    "__version__",
]
