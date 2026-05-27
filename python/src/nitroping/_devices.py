"""``devices`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.devices``. Wraps
``POST /api/v1/devices`` and ``DELETE /api/v1/devices/:id``.
"""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import quote

from ._http import HttpClient
from .types import DeactivateDeviceResult, Platform, RegisterDeviceResult


class DevicesClient:
    """Register and deactivate device rows."""

    def __init__(self, http: HttpClient) -> None:
        self._http = http

    def register(
        self,
        *,
        platform: Platform,
        token: str,
        user_id: str | None = None,
        web_push_p256dh: str | None = None,
        web_push_auth: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RegisterDeviceResult:
        """Register (or update) a device with the secret API key.

        Idempotent on ``(app_id, token, user_id)``. Returns
        ``{"id": ..., "created": True}`` when a new row was inserted,
        ``{"id": ..., "created": False}`` when an existing device matched.
        """
        wire: dict[str, Any] = {"token": token, "platform": platform}
        if user_id is not None:
            wire["user_id"] = user_id
        if web_push_p256dh is not None:
            wire["web_push_p256dh"] = web_push_p256dh
        if web_push_auth is not None:
            wire["web_push_auth"] = web_push_auth
        if metadata is not None:
            wire["metadata"] = metadata

        path = "/api/v1/public/devices" if self._http.auth_scheme == "Public" else "/api/v1/devices"
        response = self._http.request("POST", path, body=wire)
        return cast(RegisterDeviceResult, response)

    def deactivate(self, device_id: str) -> DeactivateDeviceResult:
        """Soft-delete a device (sets ``status = inactive``).

        Returns ``{"id": ..., "status": "inactive"}``. Raises
        :class:`~nitroping.errors.ApiError` with ``code = "not_found"``
        if the id doesn't belong to your app.
        """
        response = self._http.request(
            "DELETE", f"/api/v1/devices/{quote(device_id, safe='')}"
        )
        return cast(DeactivateDeviceResult, response)
