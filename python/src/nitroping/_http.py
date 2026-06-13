"""Internal stdlib HTTP wrapper.

Adds the ``Authorization`` header, JSON-serializes the body, parses the
JSON response, and maps non-2xx envelopes (``{"error": {"code",
"message", "details"}}``) into :class:`ApiError`. Underlying transport
failure (DNS / TLS / offline / abort) becomes :class:`NetworkError`.

Zero runtime deps — :mod:`urllib.request` only.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Mapping
from typing import Any, NoReturn

from .errors import ApiError, NetworkError, NitropingError

#: Default base URL pointing at the hosted nitroping service.
DEFAULT_BASE_URL = "https://nitroping.dev"

#: SDK version — bumped via ``pyproject.toml``. Used in the User-Agent
#: header so requests can be attributed during incident investigation.
SDK_VERSION = "0.2.8"


class HttpClient:
    """Internal structured HTTP client.

    Not part of the public surface — use :class:`nitroping.Nitroping`
    instead. Exposed for advanced cases where callers need to make raw
    requests against undocumented endpoints.
    """

    base_url: str
    api_key: str
    auth_scheme: str
    timeout: float
    user_agent: str

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
        user_agent: str | None = None,
        auth_scheme: str | None = None,
    ) -> None:
        if not api_key:
            raise NitropingError("api_key is required", code="invalid_argument")
        self.api_key = api_key
        self.auth_scheme = auth_scheme or ("Public" if api_key.startswith("pk_") else "ApiKey")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.user_agent = user_agent or f"nitroping-python/{SDK_VERSION}"

    def request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        headers: Mapping[str, str] | None = None,
    ) -> Any:
        """Perform an HTTP request and parse the JSON envelope.

        Returns the decoded JSON body (``dict`` for object responses,
        ``list`` / ``str`` / ``None`` for everything else). Raises
        :class:`ApiError` on non-2xx with a server envelope,
        :class:`NetworkError` on transport failure.
        """
        url = self._build_url(path)
        body_bytes: bytes | None = None

        all_headers: dict[str, str] = {
            "Authorization": f"{self.auth_scheme} {self.api_key}",
            "Accept": "application/json",
            "User-Agent": self.user_agent,
        }
        if headers:
            for k, v in headers.items():
                all_headers[k] = v

        if body is not None:
            body_bytes = json.dumps(body).encode("utf-8")
            all_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(
            url=url, data=body_bytes, method=method, headers=all_headers
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as http_err:
            # Non-2xx — try to decode the JSON error envelope, fall back
            # to ``http_<status>`` if the body is not JSON.
            err_body = http_err.read()
            _raise_for_error(http_err.code, err_body)
        except urllib.error.URLError as url_err:
            raise NetworkError(
                f"Request to {url} failed: {url_err.reason}", cause=url_err
            ) from url_err
        except TimeoutError as timeout_err:
            raise NetworkError(
                f"Request to {url} timed out", cause=timeout_err
            ) from timeout_err
        except OSError as os_err:
            raise NetworkError(
                f"Request to {url} failed: {os_err}", cause=os_err
            ) from os_err

        return _decode_body(raw)

    def _build_url(self, path: str) -> str:
        suffix = path if path.startswith("/") else f"/{path}"
        return f"{self.base_url}{suffix}"


def _decode_body(raw: bytes) -> Any:
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 2xx with a non-JSON body — pass through as a string. We never
        # hit this for the documented endpoints but it keeps the path
        # forward-compatible.
        return text


def _raise_for_error(status: int, raw: bytes) -> NoReturn:
    """Translate an HTTPError body into an :class:`ApiError` with the
    server's machine-readable code + per-field details."""
    code = f"http_{status}"
    message = f"HTTP {status}"
    details: Any = None

    if raw:
        text = raw.decode("utf-8", errors="replace")
        try:
            envelope = json.loads(text)
        except json.JSONDecodeError:
            message = f"HTTP {status}: {text[:200]}"
        else:
            if isinstance(envelope, dict):
                err = envelope.get("error")
                if isinstance(err, dict):
                    raw_code = err.get("code")
                    if isinstance(raw_code, str) and raw_code:
                        code = raw_code
                    raw_message = err.get("message")
                    if isinstance(raw_message, str) and raw_message:
                        message = raw_message
                    details = err.get("details")

    raise ApiError(message, status=status, code=code, details=details)
