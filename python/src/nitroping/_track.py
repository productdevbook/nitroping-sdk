"""``track`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.track``. Wraps
``POST /api/v1/track`` — the server SDK delivery/open/click callback.
Returns 202 immediately; the write is absorbed by a background worker.
"""

from __future__ import annotations

from typing import cast

from ._http import HttpClient
from .errors import NitropingError
from .types import TrackEvent, TrackResult


class TrackClient:
    """Record delivery/open/click events against a delivery log."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def record(
        self,
        *,
        event: TrackEvent,
        delivery_log_id: str | None = None,
        notification_id: str | None = None,
        device_token: str | None = None,
    ) -> TrackResult:
        """Record a delivery/open/click event against a delivery log.

        Identify the target either by ``delivery_log_id``, or by
        ``notification_id`` + the device's ``device_token``. ``event`` is
        one of ``delivered | opened | clicked``.

        Returns ``{"accepted": True}`` on 202.
        """
        if delivery_log_id is not None:
            wire = {"delivery_log_id": delivery_log_id, "event": event}
        elif notification_id is not None and device_token is not None:
            wire = {
                "notification_id": notification_id,
                "device_token": device_token,
                "event": event,
            }
        else:
            raise NitropingError(
                "track.record requires either delivery_log_id, or both "
                "notification_id and device_token",
                code="invalid_argument",
            )

        response = self._http.request("POST", "/api/v1/track", body=wire)
        return cast(TrackResult, response)
