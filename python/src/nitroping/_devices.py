"""``devices`` resource client.

Mounted on :class:`nitroping.Nitroping` as ``np.devices``. Wraps
``GET /api/v1/devices``, ``POST /api/v1/devices``,
``PUT /api/v1/devices/:id``, ``DELETE /api/v1/devices/:id``, and
``DELETE /api/v1/devices`` (deactivate by token).
"""

from __future__ import annotations

from typing import Any, cast
from urllib.parse import quote

from ._http import HttpClient
from .types import (
    DeactivateDeviceResult,
    DeviceSummary,
    ListDevicesResult,
    Platform,
    RegisterDeviceResult,
    UpdateDeviceResult,
)


class DevicesClient:
    """Register, update, and deactivate device rows."""

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
        tags: list[str] | None = None,
        environment: str | None = None,
        timezone: str | None = None,
    ) -> RegisterDeviceResult:
        """Register (or update) a device with the secret API key.

        Idempotent on ``(app_id, token, user_id)``. Returns
        ``{"id": ..., "created": True}`` when a new row was inserted,
        ``{"id": ..., "created": False}`` when an existing device matched.

        ``tags`` enables tag-based targeting (``target={"tags": [...]}``).

        ``environment`` is the iOS APNs environment (``"sandbox"`` or
        ``"production"``). The push host is environment-specific and a
        token can't reveal which, so report it for iOS devices; ignored
        for other platforms.

        ``timezone`` is an IANA name (e.g. ``"Europe/Istanbul"``) used
        for timezone-aware segment targeting and scheduling.
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
        if tags is not None:
            wire["tags"] = tags
        if environment is not None:
            wire["environment"] = environment
        if timezone is not None:
            wire["timezone"] = timezone

        path = "/api/v1/public/devices" if self._http.auth_scheme == "Public" else "/api/v1/devices"
        response = self._http.request("POST", path, body=wire)
        return cast(RegisterDeviceResult, response)

    def update(
        self,
        device_id: str,
        *,
        tags: list[str] | None = None,
    ) -> UpdateDeviceResult:
        """Update a device (e.g. replace its tags).

        Wraps ``PUT /api/v1/devices/:id``. Returns ``{"id": ..., "tags":
        [...]}``. Raises :class:`~nitroping.errors.ApiError` with
        ``code = "not_found"`` if the id doesn't belong to your app.
        """
        wire: dict[str, Any] = {}
        if tags is not None:
            wire["tags"] = tags

        response = self._http.request(
            "PUT", f"/api/v1/devices/{quote(device_id, safe='')}", body=wire
        )
        return cast(UpdateDeviceResult, response)

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

    def deactivate_by_token(self, token: str) -> DeactivateDeviceResult:
        """Soft-delete a device by its provider token (logout flow).

        Use this when you know the push token but not the device id.
        Wraps ``DELETE /api/v1/devices`` with a ``{"token": ...}`` body
        (no id in the path). Returns ``{"id": ..., "status":
        "inactive"}``. Raises :class:`~nitroping.errors.ApiError` with
        ``code = "not_found"`` when no device with that token belongs to
        your app.
        """
        response = self._http.request(
            "DELETE", "/api/v1/devices", body={"token": token}
        )
        return cast(DeactivateDeviceResult, response)

    # Defined last so the method name ``list`` does not shadow the
    # builtin ``list`` in the ``list[str]`` annotations above (the
    # ``from __future__ import annotations`` strings are resolved in the
    # class namespace, where this method is bound).
    def list(
        self,
        *,
        user_id: str | None = None,
        platform: Platform | None = None,
        status: str | None = None,
        page: int | None = None,
        page_size: int | None = None,
    ) -> ListDevicesResult:
        """List devices (secret API key only).

        Wraps ``GET /api/v1/devices``. Pass ``user_id`` to fetch one
        end-user's registered devices, or filter by ``platform`` /
        ``status``; ``page`` / ``page_size`` paginate (server caps
        ``page_size`` at 100). Returns ``{"data": [...], "total": <int>}``.

        The push token is **never** returned — each row in ``data`` is a
        :class:`~nitroping.types.DeviceSummary` with no token field.
        """
        params: dict[str, Any] = {
            "user_id": user_id,
            "platform": platform,
            "status": status,
            "page": page,
            "page_size": page_size,
        }
        response = self._http.request("GET", "/api/v1/devices", params=params)
        raw = cast("dict[str, Any]", response)
        return {
            "data": [
                cast(
                    DeviceSummary,
                    {
                        "id": d["id"],
                        "user_id": d["user_id"],
                        "platform": d["platform"],
                        "status": d["status"],
                        "tags": d["tags"],
                        "timezone": d["timezone"],
                        "apns_environment": d["apns_environment"],
                        "last_seen_at": d["last_seen_at"],
                        "inserted_at": d["inserted_at"],
                    },
                )
                for d in raw["data"]
            ],
            "total": raw["total"],
        }
