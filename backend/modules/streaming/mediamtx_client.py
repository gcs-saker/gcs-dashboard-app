from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from config import MediaServerSettings


class MediaMTXClientError(RuntimeError):
    """Raised when the MediaMTX control API cannot be queried."""


@dataclass(frozen=True)
class MediaMTXPath:
    name: str
    ready: bool
    source_type: str | None = None
    reader_count: int = 0


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
        payload = self._get_json("/v3/paths/list", {"itemsPerPage": "1000"})
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

    def _get_json(self, path: str, query: dict[str, str] | None = None) -> dict[str, Any]:
        query_string = f"?{urlencode(query)}" if query else ""
        request = Request(f"{self.base_url}{path}{query_string}", headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw_payload = response.read().decode("utf-8")
        except (HTTPError, URLError, TimeoutError) as exc:
            raise MediaMTXClientError(f"MediaMTX API request failed: {exc}") from exc

        try:
            payload = json.loads(raw_payload)
        except json.JSONDecodeError as exc:
            raise MediaMTXClientError("MediaMTX API returned invalid JSON") from exc

        if not isinstance(payload, dict):
            raise MediaMTXClientError("MediaMTX API returned a non-object payload")
        return payload


def _parse_path_item(item: dict[str, Any]) -> MediaMTXPath | None:
    name = item.get("name")
    if not isinstance(name, str) or not name:
        return None

    source = item.get("source")
    source_type = source.get("type") if isinstance(source, dict) and isinstance(source.get("type"), str) else None
    readers = item.get("readers")
    reader_count = len(readers) if isinstance(readers, list) else 0

    return MediaMTXPath(
        name=name,
        ready=bool(item.get("ready")),
        source_type=source_type,
        reader_count=reader_count,
    )
