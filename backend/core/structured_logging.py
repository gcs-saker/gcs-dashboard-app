from __future__ import annotations

import sys
from collections.abc import Mapping, MutableMapping
from typing import Any, TextIO

import structlog
from fastapi import Request, Response
from opentelemetry import trace
from pydantic import Field, ValidationError, field_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message
from core.tracing import route_template


class LogFieldNames:
    COMPONENT = "component"
    EVENT = "event"
    HTTP_METHOD = "http_method"
    HTTP_ROUTE = "http_route"
    SEVERITY = "severity"
    STATUS_CODE = "status_code"
    STREAM_ID = "stream_id"
    TRACE_ID = "trace_id"


class LogSeverity:
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class StructuredLogRenderers:
    JSON = "json"


SENSITIVE_FIELD_FRAGMENTS = (
    "authorization",
    "cookie",
    "credential",
    "media",
    "password",
    "payload",
    "secret",
    "token",
)
REDACTED_VALUE = "<redacted>"


class StructuredLoggingSettings(BackendBaseSettings):
    enabled: bool = Field(True, validation_alias="STRUCTURED_LOGS_ENABLED")
    renderer: str = Field(StructuredLogRenderers.JSON, validation_alias="STRUCTURED_LOG_RENDERER")

    @field_validator("renderer", mode="before")
    @classmethod
    def normalize_renderer(cls, value: object) -> object:
        if isinstance(value, str):
            return (empty_to_none(value) or StructuredLogRenderers.JSON).lower()
        return value

    @classmethod
    def from_env(cls) -> "StructuredLoggingSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("structured logging", exc)) from exc


def configure_structured_logging(
    settings: StructuredLoggingSettings | None = None,
    *,
    output: TextIO | None = None,
) -> None:
    resolved_settings = settings or StructuredLoggingSettings.from_env()
    logger_factory = structlog.PrintLoggerFactory(file=output or sys.stderr)
    if not resolved_settings.enabled:
        structlog.configure(
            processors=[drop_log_event],
            logger_factory=logger_factory,
            cache_logger_on_first_use=False,
        )
        return
    structlog.configure(
        processors=[
            add_trace_id,
            add_severity,
            redact_sensitive_fields,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=logger_factory,
        cache_logger_on_first_use=False,
    )


def get_logger(component: str) -> Any:
    if not structlog.is_configured():
        configure_structured_logging()
    return structlog.get_logger().bind(component=component)


def drop_log_event(_logger: Any, _method_name: str, _event_dict: MutableMapping[str, Any]) -> Mapping[str, Any]:
    raise structlog.DropEvent


def add_trace_id(_logger: Any, _method_name: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    span_context = trace.get_current_span().get_span_context()
    if span_context.is_valid:
        event_dict[LogFieldNames.TRACE_ID] = f"{span_context.trace_id:032x}"
    return event_dict


def add_severity(_logger: Any, method_name: str, event_dict: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    event_dict.setdefault(LogFieldNames.SEVERITY, method_name)
    return event_dict


def redact_sensitive_fields(
    _logger: Any,
    _method_name: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    return sanitize_mapping(event_dict)


def sanitize_mapping(values: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    for key, value in list(values.items()):
        if is_sensitive_key(key):
            values[key] = REDACTED_VALUE
        elif isinstance(value, MutableMapping):
            values[key] = sanitize_mapping(value)
        elif isinstance(value, Mapping):
            values[key] = sanitize_mapping(dict(value))
    return values


def is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return any(fragment in normalized for fragment in SENSITIVE_FIELD_FRAGMENTS)


def log_request_completed(logger: Any, request: Request, response: Response, duration_ms: int) -> None:
    logger.info(
        "http_request_completed",
        http_method=request.method,
        http_route=route_template(request),
        status_code=response.status_code,
        duration_ms=duration_ms,
        result="success" if response.status_code < 400 else "rejected",
    )


def log_request_failed(logger: Any, request: Request, exc: Exception, duration_ms: int) -> None:
    logger.error(
        "http_request_failed",
        http_method=request.method,
        http_route=route_template(request),
        error_type=exc.__class__.__name__,
        error_code="unhandled_request_failure",
        duration_ms=duration_ms,
        result="failed",
    )
