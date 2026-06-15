"""Top-level SDK entry points: :class:`Nitroping` and :class:`AsyncNitroping`."""

from __future__ import annotations

import asyncio
import os
from typing import Any

from ._devices import DevicesClient
from ._events import EventsClient
from ._http import DEFAULT_BASE_URL, DebugLogger, HttpClient
from ._inbox import InboxClient
from ._notifications import NotificationsClient
from ._track import TrackClient
from .errors import NitropingError
from .types import (
    CancelNotificationResult,
    DeactivateDeviceResult,
    EngagementEvent,
    ListDevicesResult,
    NotificationAction,
    NotificationResult,
    NotificationTarget,
    Platform,
    RegisterDeviceResult,
    ReportEventResult,
    TrackEvent,
    TrackResult,
    UpdateDeviceResult,
)


class Nitroping:
    """Synchronous server-side SDK client.

    Example::

        from nitroping import Nitroping

        np = Nitroping(api_key="np_live_...")
        result = np.notifications.send(
            title="Order #4129 shipped",
            body="On its way",
            target={"all": True},
        )
        print(result["id"], result["status"])
    """

    #: ``notifications`` resource — send, get, cancel.
    notifications: NotificationsClient
    #: ``devices`` resource — register, update, deactivate.
    devices: DevicesClient
    #: ``track`` resource — delivery/open/click callbacks (``POST /track``).
    track: TrackClient
    #: ``events`` resource — public engagement events (``POST /events``).
    events: EventsClient
    #: ``inbox`` resource — in-app notification center (``/public/inbox``).
    inbox: InboxClient
    #: Internal HTTP client. Exposed for advanced use (custom requests).
    http: HttpClient

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        user_agent: str | None = None,
        debug: bool | DebugLogger | None = None,
    ) -> None:
        resolved_key = api_key if api_key is not None else os.environ.get(
            "NITROPING_API_KEY"
        )
        if not resolved_key:
            raise NitropingError(
                "api_key is required. Pass it to Nitroping(api_key=...) or set "
                "the NITROPING_API_KEY environment variable.",
                code="invalid_argument",
            )
        self.http = HttpClient(
            api_key=resolved_key,
            base_url=base_url,
            timeout=timeout,
            user_agent=user_agent,
            debug=debug,
        )
        self.notifications = NotificationsClient(self.http)
        self.devices = DevicesClient(self.http)
        self.track = TrackClient(self.http)
        self.events = EventsClient(self.http)
        self.inbox = InboxClient(self.http)


class _AsyncNotificationsClient:
    """Awaitable façade over :class:`NotificationsClient`.

    Each call shells out to the sync client on the default thread pool
    via :func:`asyncio.get_running_loop().run_in_executor`. This is a
    pragmatic best-effort — for high-throughput async fanout, run the
    underlying HTTP calls in a real async client (``httpx``, ``aiohttp``)
    and skip this wrapper.
    """

    def __init__(self, inner: NotificationsClient) -> None:
        self._inner = inner

    async def send(
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
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.send(
                target=target,
                title=title,
                body=body,
                template=template,
                vars=vars,
                data=data,
                icon=icon,
                image=image,
                click_action=click_action,
                deep_link=deep_link,
                actions=actions,
                apns_category=apns_category,
                scheduled_at=scheduled_at,
                expires_at=expires_at,
                recurrence=recurrence,
                recurrence_tz=recurrence_tz,
                recurrence_until=recurrence_until,
                email_to=email_to,
                idempotency_key=idempotency_key,
            ),
        )

    async def get(self, notification_id: str) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.get, notification_id
        )

    async def cancel(self, notification_id: str) -> CancelNotificationResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.cancel, notification_id
        )


class _AsyncDevicesClient:
    """Awaitable façade over :class:`DevicesClient`."""

    def __init__(self, inner: DevicesClient) -> None:
        self._inner = inner

    async def register(
        self,
        *,
        platform: Platform,
        token: str,
        user_id: str | None = None,
        web_push_p256dh: str | None = None,
        web_push_auth: str | None = None,
        metadata: dict[str, Any] | None = None,
        tags: list[str] | None = None,
        environment: str | None = None,
        timezone: str | None = None,
    ) -> RegisterDeviceResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.register(
                platform=platform,
                token=token,
                user_id=user_id,
                web_push_p256dh=web_push_p256dh,
                web_push_auth=web_push_auth,
                metadata=metadata,
                tags=tags,
                environment=environment,
                timezone=timezone,
            ),
        )

    async def update(
        self,
        device_id: str,
        *,
        tags: list[str] | None = None,
    ) -> UpdateDeviceResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.update(device_id, tags=tags),
        )

    async def deactivate(self, device_id: str) -> DeactivateDeviceResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.deactivate, device_id
        )

    async def deactivate_by_token(self, token: str) -> DeactivateDeviceResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.deactivate_by_token, token
        )

    # Defined last so ``list`` does not shadow the builtin in the
    # ``list[str]`` annotations on the methods above.
    async def list(
        self,
        *,
        user_id: str | None = None,
        platform: Platform | None = None,
        status: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> ListDevicesResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.list(
                user_id=user_id,
                platform=platform,
                status=status,
                page=page,
                page_size=page_size,
            ),
        )


class _AsyncTrackClient:
    """Awaitable façade over :class:`TrackClient`."""

    def __init__(self, inner: TrackClient) -> None:
        self._inner = inner

    async def record(
        self,
        *,
        event: TrackEvent,
        delivery_log_id: str | None = None,
        notification_id: str | None = None,
        device_token: str | None = None,
    ) -> TrackResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.record(
                event=event,
                delivery_log_id=delivery_log_id,
                notification_id=notification_id,
                device_token=device_token,
            ),
        )


class _AsyncEventsClient:
    """Awaitable façade over :class:`EventsClient`."""

    def __init__(self, inner: EventsClient) -> None:
        self._inner = inner

    async def report(
        self,
        *,
        notification_id: str,
        device_id: str,
        type: EngagementEvent,
        action_id: str | None = None,
        happened_at: str | None = None,
    ) -> ReportEventResult:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.report(
                notification_id=notification_id,
                device_id=device_id,
                type=type,
                action_id=action_id,
                happened_at=happened_at,
            ),
        )


class _AsyncInboxClient:
    """Awaitable façade over :class:`InboxClient`."""

    def __init__(self, inner: InboxClient) -> None:
        self._inner = inner

    async def list(
        self,
        user_id: str,
        *,
        unread_only: bool | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._inner.list(
                user_id, unread_only=unread_only, limit=limit
            ),
        )

    async def unread_count(self, user_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.unread_count, user_id
        )

    async def mark_read(self, user_id: str, item_id: str) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.mark_read, user_id, item_id
        )

    async def mark_all_read(self, user_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._inner.mark_all_read, user_id
        )


class AsyncNitroping:
    """Async server-side SDK client.

    Wraps the sync :class:`Nitroping` client and runs each HTTP call on
    the default thread pool. Convenient when you want to ``await`` an
    SDK method from inside an async framework (FastAPI, aiohttp,
    Starlette) without pulling in a separate async HTTP dependency.

    For real-world high-fanout (thousands of concurrent sends) prefer a
    purpose-built async HTTP client and call the API directly — this
    wrapper still bottlenecks on the executor pool size.
    """

    notifications: _AsyncNotificationsClient
    devices: _AsyncDevicesClient
    track: _AsyncTrackClient
    events: _AsyncEventsClient
    inbox: _AsyncInboxClient

    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        user_agent: str | None = None,
        debug: bool | DebugLogger | None = None,
    ) -> None:
        self._sync = Nitroping(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            user_agent=user_agent,
            debug=debug,
        )
        self.notifications = _AsyncNotificationsClient(self._sync.notifications)
        self.devices = _AsyncDevicesClient(self._sync.devices)
        self.track = _AsyncTrackClient(self._sync.track)
        self.events = _AsyncEventsClient(self._sync.events)
        self.inbox = _AsyncInboxClient(self._sync.inbox)

    @property
    def http(self) -> HttpClient:
        """Underlying sync HTTP client (advanced use)."""
        return self._sync.http
