from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping, MutableMapping
from contextlib import contextmanager
from typing import Any
from urllib.parse import urlparse

from fastapi import Request, Response
from opentelemetry import context, propagate, trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter, SimpleSpanProcessor, SpanExporter
from opentelemetry.trace import SpanKind, Tracer
from pydantic import Field, ValidationError, field_validator, model_validator

from core.env_parsing import empty_to_none
from core.settings_base import BackendBaseSettings, SettingsConfigurationError, settings_error_message


class TraceHeaders:
    TRACEPARENT = "traceparent"
    TRACESTATE = "tracestate"


class TraceExporters:
    NONE = "none"
    CONSOLE = "console"
    OTLP = "otlp"


class TraceDefaults:
    OTLP_ENDPOINT = "http://otel-collector:4317"
    EXPORT_TIMEOUT_SECONDS = 1.0
    MAX_QUEUE_SIZE = 512
    MAX_EXPORT_BATCH_SIZE = 128
    SCHEDULE_DELAY_MILLIS = 2_000


class TraceAttributeNames:
    COMPONENT = "gcs.component"
    SCHEMA_VERSION = "gcs.schema_version"
    HTTP_METHOD = "http.request.method"
    HTTP_ROUTE = "http.route"
    HTTP_STATUS_CODE = "http.response.status_code"
    MESSAGING_SYSTEM = "messaging.system"
    MESSAGING_DESTINATION_CHANNEL = "messaging.destination.channel"


class TracingSettings(BackendBaseSettings):
    enabled: bool = Field(False, validation_alias="OTEL_TRACES_ENABLED")
    service_name: str = Field("gcs-saker-python-backend", validation_alias="OTEL_SERVICE_NAME")
    exporter: str = Field(TraceExporters.NONE, validation_alias="OTEL_TRACES_EXPORTER")
    otlp_endpoint: str = Field(TraceDefaults.OTLP_ENDPOINT, validation_alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    export_timeout_seconds: float = Field(
        TraceDefaults.EXPORT_TIMEOUT_SECONDS,
        validation_alias="OTEL_EXPORT_TIMEOUT_SECONDS",
        gt=0,
        le=5,
    )
    max_queue_size: int = Field(
        TraceDefaults.MAX_QUEUE_SIZE, validation_alias="OTEL_BSP_MAX_QUEUE_SIZE", ge=64, le=4096
    )
    max_export_batch_size: int = Field(
        TraceDefaults.MAX_EXPORT_BATCH_SIZE,
        validation_alias="OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
        ge=1,
        le=512,
    )

    @field_validator("service_name", mode="before")
    @classmethod
    def default_blank_service_name(cls, value: object) -> object:
        if isinstance(value, str):
            return empty_to_none(value) or "gcs-saker-python-backend"
        return value

    @field_validator("exporter", mode="before")
    @classmethod
    def normalize_exporter(cls, value: object) -> object:
        if isinstance(value, str):
            return (empty_to_none(value) or TraceExporters.NONE).lower()
        return value

    @model_validator(mode="after")
    def validate_exporter_boundary(self) -> "TracingSettings":
        if self.exporter not in {TraceExporters.NONE, TraceExporters.CONSOLE, TraceExporters.OTLP}:
            raise ValueError("unsupported trace exporter")
        if self.max_export_batch_size > self.max_queue_size:
            raise ValueError("trace export batch cannot exceed queue size")
        if self.exporter == TraceExporters.OTLP:
            endpoint = urlparse(self.otlp_endpoint)
            if endpoint.scheme != "http" or endpoint.hostname not in {"otel-collector", "127.0.0.1", "localhost"}:
                raise ValueError("OTLP endpoint must use the internal collector boundary")
        return self

    @classmethod
    def from_env(cls) -> "TracingSettings":
        try:
            return cls()
        except ValidationError as exc:
            raise SettingsConfigurationError(settings_error_message("tracing", exc)) from exc


def build_tracer_provider(settings: TracingSettings, exporter: SpanExporter | None = None) -> TracerProvider:
    provider = TracerProvider(resource=Resource.create({"service.name": settings.service_name}))
    resolved_exporter = exporter or exporter_from_settings(settings)
    if resolved_exporter is not None:
        provider.add_span_processor(span_processor_for(settings, resolved_exporter, exporter is not None))
    return provider


def span_processor_for(
    settings: TracingSettings,
    exporter: SpanExporter,
    explicit_exporter: bool = False,
) -> SimpleSpanProcessor | BatchSpanProcessor:
    if explicit_exporter or settings.exporter != TraceExporters.OTLP:
        return SimpleSpanProcessor(exporter)
    return BatchSpanProcessor(
        exporter,
        max_queue_size=settings.max_queue_size,
        schedule_delay_millis=TraceDefaults.SCHEDULE_DELAY_MILLIS,
        max_export_batch_size=settings.max_export_batch_size,
        export_timeout_millis=int(settings.export_timeout_seconds * 1_000),
    )


def exporter_from_settings(settings: TracingSettings) -> SpanExporter | None:
    if settings.exporter == TraceExporters.CONSOLE:
        return ConsoleSpanExporter()
    if settings.exporter == TraceExporters.OTLP:
        return OTLPSpanExporter(
            endpoint=settings.otlp_endpoint,
            insecure=True,
            timeout=settings.export_timeout_seconds,
        )
    return None


def shutdown_tracer_provider(provider: TracerProvider | None) -> None:
    if provider is None:
        return
    provider.force_flush(timeout_millis=1_000)
    provider.shutdown()


def configure_global_tracing(settings: TracingSettings | None = None) -> TracerProvider | None:
    resolved_settings = settings or TracingSettings.from_env()
    if not resolved_settings.enabled:
        return None
    provider = build_tracer_provider(resolved_settings)
    trace.set_tracer_provider(provider)
    return provider


def tracer_for(provider: TracerProvider | None = None) -> Tracer:
    if provider is not None:
        return provider.get_tracer("gcs-saker-python")
    return trace.get_tracer("gcs-saker-python")


def extract_trace_context(headers: Mapping[str, str]) -> context.Context:
    carrier = {
        TraceHeaders.TRACEPARENT: headers.get(TraceHeaders.TRACEPARENT, ""),
        TraceHeaders.TRACESTATE: headers.get(TraceHeaders.TRACESTATE, ""),
    }
    return propagate.extract(carrier)


def inject_trace_headers(carrier: MutableMapping[str, str]) -> None:
    propagate.inject(carrier)


async def trace_fastapi_request(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
    *,
    settings: TracingSettings | None = None,
    provider: TracerProvider | None = None,
) -> Response:
    resolved_settings = settings or TracingSettings.from_env()
    if not resolved_settings.enabled:
        return await call_next(request)

    parent_context = extract_trace_context(request.headers)
    route = route_template(request)
    span_name = f"HTTP {request.method} {route}"
    with tracer_for(provider).start_as_current_span(span_name, context=parent_context, kind=SpanKind.SERVER) as span:
        span.set_attribute(TraceAttributeNames.COMPONENT, "python-fallback")
        span.set_attribute(TraceAttributeNames.HTTP_METHOD, request.method)
        span.set_attribute(TraceAttributeNames.HTTP_ROUTE, route)
        response = await call_next(request)
        span.set_attribute(TraceAttributeNames.HTTP_STATUS_CODE, response.status_code)
        response_headers: dict[str, str] = {}
        inject_trace_headers(response_headers)
        for name, value in response_headers.items():
            response.headers[name] = value
        return response


def route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    return str(path or request.url.path)


@contextmanager
def trace_ai_sidecar_call(
    *,
    schema_version: str,
    provider: TracerProvider | None = None,
) -> Any:
    with tracer_for(provider).start_as_current_span("ai.sidecar.detect", kind=SpanKind.INTERNAL) as span:
        span.set_attribute(TraceAttributeNames.COMPONENT, "ai-sidecar")
        span.set_attribute(TraceAttributeNames.SCHEMA_VERSION, schema_version)
        yield span


@contextmanager
def trace_mqtt_publish(*, destination_channel: str, provider: TracerProvider | None = None) -> Any:
    with tracer_for(provider).start_as_current_span("mqtt.publish", kind=SpanKind.PRODUCER) as span:
        span.set_attribute(TraceAttributeNames.MESSAGING_SYSTEM, "mqtt")
        span.set_attribute(TraceAttributeNames.MESSAGING_DESTINATION_CHANNEL, destination_channel)
        yield span
