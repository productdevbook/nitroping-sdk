"""Internal stdlib HTTP wrapper.

Adds the ``Authorization`` header, JSON-serializes the body, parses the
JSON response, and maps non-2xx envelopes (``{"error": {"code",
"message", "details"}}``) into :class:`ApiError`. Underlying transport
failure (DNS / TLS / offline / abort) becomes :class:`NetworkError`.

Zero runtime deps — :mod:`urllib.request` only.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from typing import Any, NoReturn

from .errors import ApiError, NetworkError, NitropingError

#: Debug sink: receives one structured ``{"phase", "method", "url", ...}``
#: event per request-lifecycle step.
DebugLogger = Callable[[dict[str, Any]], None]

#: Stdlib logger used when ``debug=True``. Events are emitted at DEBUG.
_LOGGER = logging.getLogger("nitroping")

#: Default base URL pointing at the hosted nitroping service.
DEFAULT_BASE_URL = "https://nitroping.dev"

#: SDK version — bumped via ``pyproject.toml``. Used in the User-Agent
#: header so requests can be attributed during incident investigation.
SDK_VERSION = "0.2.13"


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
        debug: bool | DebugLogger | None = None,
    ) -> None:
        if not api_key:
            raise NitropingError("api_key is required", code="invalid_argument")
        self.api_key = api_key
        self.auth_scheme = auth_scheme or ("Public" if api_key.startswith("pk_") else "ApiKey")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.user_agent = user_agent or f"nitroping-python/{SDK_VERSION}"
        self._debug = _resolve_debug(debug)

    def request(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        headers: Mapping[str, str] | None = None,
        params: Mapping[str, Any] | None = None,
    ) -> Any:
        """Perform an HTTP request and parse the JSON envelope.

        Returns the decoded JSON body (``dict`` for object responses,
        ``list`` / ``str`` / ``None`` for everything else). Raises
        :class:`ApiError` on non-2xx with a server envelope,
        :class:`NetworkError` on transport failure.

        ``params`` are appended to the URL as a query string;
        ``None``-valued entries are omitted.
        """
        url = self._build_url(path, params)
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

        started_at = time.monotonic()
        self._emit(
            {
                "phase": "request",
                "method": method,
                "url": url,
                "headers": _redact_headers(all_headers),
                "body": body,
            }
        )

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                raw = response.read()
                status = getattr(response, "status", None)
        except urllib.error.HTTPError as http_err:
            # Non-2xx — try to decode the JSON error envelope, fall back
            # to ``http_<status>`` if the body is not JSON.
            err_body = http_err.read()
            self._emit(
                {
                    "phase": "response",
                    "method": method,
                    "url": url,
                    "status": http_err.code,
                    "ms": (time.monotonic() - started_at) * 1000,
                }
            )
            _raise_for_error(http_err.code, err_body)
        except urllib.error.URLError as url_err:
            self._emit_error(method, url, started_at, str(url_err.reason))
            raise NetworkError(
                f"Request to {url} failed: {url_err.reason}", cause=url_err
            ) from url_err
        except TimeoutError as timeout_err:
            self._emit_error(method, url, started_at, "timed out")
            raise NetworkError(
                f"Request to {url} timed out", cause=timeout_err
            ) from timeout_err
        except OSError as os_err:
            self._emit_error(method, url, started_at, str(os_err))
            raise NetworkError(
                f"Request to {url} failed: {os_err}", cause=os_err
            ) from os_err

        value = _decode_body(raw)
        self._emit(
            {
                "phase": "response",
                "method": method,
                "url": url,
                "status": status,
                "ms": (time.monotonic() - started_at) * 1000,
                "body": value,
            }
        )
        return value

    def _build_url(self, path: str, params: Mapping[str, Any] | None = None) -> str:
        suffix = path if path.startswith("/") else f"/{path}"
        url = f"{self.base_url}{suffix}"
        if params:
            pairs = [(k, v) for k, v in params.items() if v is not None]
            if pairs:
                query = urllib.parse.urlencode(pairs)
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}{query}"
        return url

    def _emit(self, event: dict[str, Any]) -> None:
        if self._debug is not None:
            self._debug(event)

    def _emit_error(
        self, method: str, url: str, started_at: float, error: str
    ) -> None:
        self._emit(
            {
                "phase": "error",
                "method": method,
                "url": url,
                "ms": (time.monotonic() - started_at) * 1000,
                "error": error,
            }
        )


def _redact_headers(headers: Mapping[str, str]) -> dict[str, str]:
    """Strip the ``Authorization`` header before it reaches a log sink."""
    return {
        k: ("[redacted]" if k.lower() == "authorization" else v)
        for k, v in headers.items()
    }


def _resolve_debug(debug: bool | DebugLogger | None) -> DebugLogger | None:
    """Normalize the ``debug`` option into a logger (or ``None`` when off).

    ``True`` logs each event to the stdlib ``nitroping`` logger at DEBUG;
    a callable receives the structured event dict; falsy disables it. The
    API key is never included in any event (headers are redacted upstream).
    """
    if not debug:
        return None
    if callable(debug):
        return debug

    def _sink(event: dict[str, Any]) -> None:
        phase = event.get("phase")
        method = event.get("method")
        url = event.get("url")
        if phase == "response":
            _LOGGER.debug(
                "%s %s -> %s (%.0fms)",
                method,
                url,
                event.get("status"),
                event.get("ms", 0.0),
            )
        elif phase == "error":
            _LOGGER.debug(
                "%s %s x %s (%.0fms)",
                method,
                url,
                event.get("error"),
                event.get("ms", 0.0),
            )
        else:
            _LOGGER.debug("%s %s", method, url)

    return _sink


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
