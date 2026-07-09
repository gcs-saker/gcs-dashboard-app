from __future__ import annotations

import json
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
    def __init__(self, base_url: str, timeout_seconds: float = 1.5) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    @classmethod
    def from_env(cls) -> "MediaMTXClient | None":
        api_base_url = MediaServerSettings.from_env().api_base_url
        if api_base_url is None:
            return None
        return cls(api_base_url)

    def list_paths(self) -> list[MediaMTXPath]:
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

    def _get_json(self, path: str, query: dict[str, str] | None = None) -> dict[str, object]:
        try:
            with httpx.Client(base_url=self.base_url, timeout=self.timeout_seconds) as client:
                response = client.get(
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
