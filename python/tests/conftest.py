"""Shared test helpers.

The SDK is built on ``urllib.request.urlopen``, so the test suite mocks
that single seam. ``mock_urlopen`` returns a fixture that records every
call and lets the test specify the response (or error) per request.
"""

from __future__ import annotations

import io
import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import patch
from urllib.error import HTTPError

import pytest


class _CapturedRequest:
    """A urllib.request.Request that we can introspect in tests."""

    def __init__(self, request: Any) -> None:
        self.url: str = request.full_url
        self.method: str = request.get_method()
        # urllib's ``Request.add_header`` runs the key through ``.capitalize()``
        # so e.g. "Content-Type" is stored as "Content-type". The test suite
        # asserts against that capitalized form.
        self.headers: dict[str, str] = dict(request.header_items())
        body = request.data
        if body is None:
            self.body_bytes: bytes | None = None
            self.body_json: Any = None
        else:
            self.body_bytes = body
            try:
                self.body_json = json.loads(body.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                self.body_json = None


class _FakeResponse:
    """Minimal stand-in for the ``http.client.HTTPResponse`` returned
    from ``urlopen`` — supports the context-manager + ``.read()`` +
    ``.status`` surface the SDK uses."""

    def __init__(self, status: int, body: bytes) -> None:
        self.status = status
        self._body = body

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *args: object) -> None:
        return None

    def read(self) -> bytes:
        return self._body


class MockUrlopen:
    """Context manager that swaps ``urllib.request.urlopen`` for a
    deterministic stub. The stub returns whatever the test queues via
    :meth:`enqueue`."""

    def __init__(self) -> None:
        self.calls: list[_CapturedRequest] = []
        self._queue: list[
            tuple[int, bytes] | HTTPError | Exception
        ] = []

    def enqueue_json(self, status: int, payload: Any) -> None:
        self._queue.append((status, json.dumps(payload).encode("utf-8")))

    def enqueue_error(
        self,
        status: int,
        payload: Any,
        url: str = "https://nitroping.dev/",
    ) -> None:
        body = json.dumps(payload).encode("utf-8")
        err = HTTPError(
            url=url,
            code=status,
            msg=f"HTTP {status}",
            hdrs=None,  # type: ignore[arg-type]
            fp=io.BytesIO(body),
        )
        self._queue.append(err)

    def enqueue_raw_error(self, err: Exception) -> None:
        self._queue.append(err)

    def _fake(self, request: Any, timeout: float | None = None) -> _FakeResponse:
        self.calls.append(_CapturedRequest(request))
        if not self._queue:
            raise AssertionError("No mock response queued for this urlopen call")
        item = self._queue.pop(0)
        if isinstance(item, Exception):
            raise item
        status, body = item
        return _FakeResponse(status, body)


@pytest.fixture
def mock_urlopen() -> Iterator[MockUrlopen]:
    fake = MockUrlopen()
    with patch("nitroping._http.urllib.request.urlopen", side_effect=fake._fake):
        yield fake
