import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

StreamPrefix = Literal["raw", "ai", "archive"]

SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class StreamPathError(ValueError):
    """Raised when a stream path or stream id violates the routing contract."""


@dataclass(frozen=True)
class StreamPath:
    prefix: StreamPrefix
    asset_id: str
    sensor_id: str
    processor_id: str | None = None
    archive_date: str | None = None

    @property
    def path(self) -> str:
        if self.prefix == "ai":
            return f"ai/{self.asset_id}/{self.sensor_id}/{self.processor_id}"
        if self.prefix == "archive":
            return f"archive/{self.asset_id}/{self.sensor_id}/{self.archive_date}"
        return f"raw/{self.asset_id}/{self.sensor_id}"

    @property
    def stream_id(self) -> str:
        return self.path.replace("/", ".")

    def to_api_dict(self) -> dict[str, str | None]:
        return {
            "prefix": self.prefix,
            "assetId": self.asset_id,
            "sensorId": self.sensor_id,
            "processorId": self.processor_id,
            "date": self.archive_date,
            "path": self.path,
            "streamId": self.stream_id,
        }


def validate_stream_path(path: str) -> StreamPath:
    parts = _validated_path_parts(path)
    return _parse_stream_parts(parts)


def _validated_path_parts(path: str) -> list[str]:
    if not isinstance(path, str) or not path:
        raise StreamPathError("stream path must be a non-empty string")
    if path.startswith("/") or path.endswith("/"):
        raise StreamPathError("stream path must not start or end with slash")
    if "\\" in path:
        raise StreamPathError("stream path must use forward slash separators")

    parts = path.split("/")
    if any(part == "" for part in parts):
        raise StreamPathError("stream path must not contain empty segments")

    return parts


def _parse_stream_parts(parts: list[str]) -> StreamPath:
    prefix = parts[0]
    if prefix == "raw":
        return _parse_raw_stream(parts)
    if prefix == "ai":
        return _parse_ai_stream(parts)
    if prefix == "archive":
        return _parse_archive_stream(parts)
    raise StreamPathError("stream path prefix must be one of raw, ai, archive")


def _parse_raw_stream(parts: list[str]) -> StreamPath:
    _require_segment_count(parts, 3, "raw/{assetId}/{sensorId}")
    asset_id, sensor_id = _validate_named_segments(parts[1], parts[2])
    return StreamPath(prefix="raw", asset_id=asset_id, sensor_id=sensor_id)


def _parse_ai_stream(parts: list[str]) -> StreamPath:
    _require_segment_count(parts, 4, "ai/{assetId}/{sensorId}/{processorId}")
    asset_id, sensor_id, processor_id = _validate_named_segments(parts[1], parts[2], parts[3])
    return StreamPath(prefix="ai", asset_id=asset_id, sensor_id=sensor_id, processor_id=processor_id)


def _parse_archive_stream(parts: list[str]) -> StreamPath:
    _require_segment_count(parts, 4, "archive/{assetId}/{sensorId}/{date}")
    asset_id, sensor_id = _validate_named_segments(parts[1], parts[2])
    return StreamPath(prefix="archive", asset_id=asset_id, sensor_id=sensor_id, archive_date=_validate_archive_date(parts[3]))


def validate_stream_id(stream_id: str) -> StreamPath:
    if not isinstance(stream_id, str) or not stream_id:
        raise StreamPathError("stream id must be a non-empty string")
    if "/" in stream_id or "\\" in stream_id:
        raise StreamPathError("stream id must use dot separators only")
    if stream_id.startswith(".") or stream_id.endswith("."):
        raise StreamPathError("stream id must not start or end with dot")
    if ".." in stream_id:
        raise StreamPathError("stream id must not contain empty segments")

    return validate_stream_path(stream_id.replace(".", "/"))


def path_to_stream_id(path: str) -> str:
    return validate_stream_path(path).stream_id


def stream_id_to_path(stream_id: str) -> str:
    return validate_stream_id(stream_id).path


def _require_segment_count(parts: list[str], expected: int, shape: str) -> None:
    if len(parts) != expected:
        raise StreamPathError(f"stream path must match {shape}")


def _validate_named_segments(*segments: str) -> tuple[str, ...]:
    for segment in segments:
        if segment in {".", ".."}:
            raise StreamPathError("stream path must not contain traversal segments")
        if not SEGMENT_PATTERN.fullmatch(segment):
            raise StreamPathError("stream path segments may contain only letters, numbers, hyphen, and underscore")
    return segments


def _validate_archive_date(value: str) -> str:
    if not DATE_PATTERN.fullmatch(value):
        raise StreamPathError("archive stream date must match YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise StreamPathError("archive stream date must be a valid calendar date") from exc
    return value
