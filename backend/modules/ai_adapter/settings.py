from __future__ import annotations

import json
from urllib.parse import urlparse

from pydantic import Field, ValidationError, field_validator

from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message


class AIAdapterSettings(BackendBaseSettings):
    processor_endpoints_json: str = Field("{}", validation_alias="AI_PROCESSOR_ENDPOINTS_JSON")
    stream_base_url: str = Field("http://mediamtx:8889", validation_alias="AI_STREAM_BASE_URL")
    timeout_seconds: float = Field(2.0, ge=0.1, le=30.0, validation_alias="AI_ADAPTER_TIMEOUT_SECONDS")

    @field_validator("stream_base_url")
    @classmethod
    def validate_stream_base_url(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("AI_STREAM_BASE_URL must be an absolute HTTP(S) URL")
        return value.rstrip("/")

    @classmethod
    def from_env(cls) -> "AIAdapterSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("ai-adapter", exc)) from exc

    def processor_endpoints(self) -> dict[str, str]:
        try:
            raw = json.loads(self.processor_endpoints_json)
        except json.JSONDecodeError as exc:
            raise SettingsConfigurationError("AI_PROCESSOR_ENDPOINTS_JSON must be valid JSON") from exc
        if not isinstance(raw, dict):
            raise SettingsConfigurationError("AI_PROCESSOR_ENDPOINTS_JSON must be an object")
        endpoints: dict[str, str] = {}
        for processor_id, endpoint in raw.items():
            parsed = urlparse(endpoint) if isinstance(endpoint, str) else None
            if (
                not isinstance(processor_id, str)
                or not processor_id
                or parsed is None
                or parsed.scheme not in {"http", "https"}
                or not parsed.hostname
            ):
                raise SettingsConfigurationError(
                    "AI processor endpoints must map non-empty IDs to absolute HTTP(S) URLs"
                )
            endpoints[processor_id] = endpoint
        return endpoints
