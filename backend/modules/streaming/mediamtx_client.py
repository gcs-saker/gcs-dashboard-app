from __future__ import annotations

import json
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass

import httpx

from config import MediaServerSettings


class MediaMTXClientError(RuntimeError):
    """Raised when the MediaMTX control API cannot be queried."""


class MediaMTXApiRoutes:
    PATHS_LIST = "/v3/paths/list"


class MediaMTXApiQuery:
    ITEMS_PER_PAGE = "itemsPerPage"
    DEFAULT_ITEMS_PER_PAGE = "1000"


class MediaMTXHttpHeaders:
    ACCEPT = "Accept"
    APPLICATION_JSON = "application/json"


@dataclass(frozen=True)
class MediaMTXPath:
    name: str
    ready: bool
    source_type: str | None = None
    reader_count: int = 0

    @classmethod
    def from_api_item(cls, item: Mapping[str, object]) -> "MediaMTXPath | None":
        name = item.get("name")
        if not isinstance(name, str) or not name:
            return None
        return cls(
            name=name,
            ready=bool(item.get("ready")),
            source_type=_source_type(item.get("source")),
            reader_count=_reader_count(item.get("readers")),
        )


class MediaMTXClient:
    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 1.5,
        username: str = "",
        password: str = "",
        snapshot_ttl_seconds: float = 1.0,
        stale_ttl_seconds: float = 5.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.username = username
        self.password = password
        auth = (username, password) if username and password else None
        self._client = httpx.Client(base_url=self.base_url, timeout=timeout_seconds, auth=auth)
        self._snapshot_ttl_seconds = snapshot_ttl_seconds
        self._stale_ttl_seconds = stale_ttl_seconds
        self._snapshot: tuple[float, list[MediaMTXPath]] | None = None
        self._refresh_lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "MediaMTXClient | None":
        settings = MediaServerSettings.from_env()
        api_base_url = settings.api_base_url
        if api_base_url is None:
            return None
        return cls(api_base_url, username=settings.api_username or "", password=settings.api_password or "")

    def list_paths(self) -> list[MediaMTXPath]:
        cached = self._cached_paths(self._snapshot_ttl_seconds)
        if cached is not None:
            return cached
        with self._refresh_lock:
            cached = self._cached_paths(self._snapshot_ttl_seconds)
            if cached is not None:
                return cached
            try:
                paths = self._load_paths()
            except MediaMTXClientError:
                stale = self._cached_paths(self._stale_ttl_seconds)
                if stale is not None:
                    return stale
                raise
            self._snapshot = (time.monotonic(), paths)
            return list(paths)

    def _load_paths(self) -> list[MediaMTXPath]:
        payload = self._get_json(
            MediaMTXApiRoutes.PATHS_LIST,
            {MediaMTXApiQuery.ITEMS_PER_PAGE: MediaMTXApiQuery.DEFAULT_ITEMS_PER_PAGE},
        )
        items = payload.get("items", [])
        if not isinstance(items, list):
            raise MediaMTXClientError("MediaMTX paths response is missing an items list")

        paths: list[MediaMTXPath] = []
        for item in items:
            if isinstance(item, dict):
                path = _parse_path_item(item)
                if path is not None:
                    paths.append(path)
        return paths

    def _cached_paths(self, ttl_seconds: float) -> list[MediaMTXPath] | None:
        if self._snapshot is None or time.monotonic() - self._snapshot[0] > ttl_seconds:
            return None
        return list(self._snapshot[1])

    def invalidate(self) -> None:
        self._snapshot = None

    def close(self) -> None:
        self._client.close()

    def _get_json(self, path: str, query: dict[str, str] | None = None) -> dict[str, object]:
        try:
            response = self._client.get(
                path,
                params=query,
                headers={MediaMTXHttpHeaders.ACCEPT: MediaMTXHttpHeaders.APPLICATION_JSON},
            )
            response.raise_for_status()
        except (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException) as exc:
            raise MediaMTXClientError(f"MediaMTX API request failed: {exc}") from exc

        try:
            payload = response.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise MediaMTXClientError("MediaMTX API returned invalid JSON") from exc

        if not isinstance(payload, dict):
            raise MediaMTXClientError("MediaMTX API returned a non-object payload")
        return dict(payload)


def _parse_path_item(item: Mapping[str, object]) -> MediaMTXPath | None:
    return MediaMTXPath.from_api_item(item)


def _source_type(source: object) -> str | None:
    if not isinstance(source, Mapping):
        return None
    value = source.get("type")
    return value if isinstance(value, str) else None


def _reader_count(readers: object) -> int:
    return len(readers) if isinstance(readers, list) else 0
