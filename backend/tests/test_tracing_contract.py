from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from core.tracing import (
    TraceAttributeNames,
    TraceExporters,
    TraceHeaders,
    TracingSettings,
    build_tracer_provider,
    extract_trace_context,
    inject_trace_headers,
    shutdown_tracer_provider,
    span_processor_for,
    trace_ai_sidecar_call,
    trace_fastapi_request,
    tracer_for,
)


def tracing_fixture() -> tuple[InMemorySpanExporter, TracerProvider]:
    exporter = InMemorySpanExporter()
    provider = build_tracer_provider(
        TracingSettings(
            enabled=True,
            service_name="gcs-saker-test",
            exporter=TraceExporters.NONE,
        ),
        exporter,
    )
    return exporter, provider


def test_trace_context_header_roundtrip() -> None:
    exporter, provider = tracing_fixture()
    carrier: dict[str, str] = {}

    with tracer_for(provider).start_as_current_span("parent") as parent_span:
        parent_span_id = parent_span.get_span_context().span_id
        inject_trace_headers(carrier)

    extracted_context = extract_trace_context(carrier)
    with tracer_for(provider).start_as_current_span("child", context=extracted_context):
        pass

    spans = exporter.get_finished_spans()
    child_span = next(span for span in spans if span.name == "child")
    assert TraceHeaders.TRACEPARENT in carrier
    assert child_span.parent is not None
    assert child_span.parent.span_id == parent_span_id


def test_fastapi_trace_middleware_creates_safe_request_span() -> None:
    exporter, provider = tracing_fixture()
    settings = TracingSettings(enabled=True, service_name="gcs-saker-test", exporter=TraceExporters.NONE)
    app = FastAPI()

    @app.middleware("http")
    async def tracing_middleware(request: Request, call_next):
        return await trace_fastapi_request(request, call_next, settings=settings, provider=provider)

    @app.get("/probe/{item_id}")
    def probe(item_id: str) -> dict[str, str]:
        return {"itemId": item_id}

    response = TestClient(app).get(
        "/probe/alpha?token=must-not-appear",
        headers={"Authorization": "Bearer must-not-appear"},
    )

    spans = exporter.get_finished_spans()
    request_span = next(span for span in spans if span.name == "HTTP GET /probe/alpha")
    attributes = request_span.attributes or {}
    assert response.status_code == 200
    assert TraceHeaders.TRACEPARENT in response.headers
    assert attributes[TraceAttributeNames.HTTP_ROUTE] == "/probe/alpha"
    assert attributes[TraceAttributeNames.HTTP_STATUS_CODE] == 200
    assert all("must-not-appear" not in str(value) for value in attributes.values())
    assert all("authorization" not in key.lower() for key in attributes)


def test_ai_sidecar_span_uses_metadata_only() -> None:
    exporter, provider = tracing_fixture()

    with trace_ai_sidecar_call(
        schema_version="ai.detection.v1alpha1",
        provider=provider,
    ):
        pass

    span = exporter.get_finished_spans()[0]
    attributes = span.attributes or {}
    assert span.name == "ai.sidecar.detect"
    assert attributes[TraceAttributeNames.COMPONENT] == "ai-sidecar"
    assert attributes[TraceAttributeNames.SCHEMA_VERSION] == "ai.detection.v1alpha1"
    assert all("stream" not in key.lower() for key in attributes)
    assert all("payload" not in key.lower() for key in attributes)


def test_otlp_exporter_uses_bounded_async_processor() -> None:
    exporter = InMemorySpanExporter()
    settings = TracingSettings(
        enabled=True,
        exporter=TraceExporters.OTLP,
        otlp_endpoint="http://otel-collector:4317",
        max_queue_size=256,
        max_export_batch_size=64,
    )

    processor = span_processor_for(settings, exporter)

    assert isinstance(processor, BatchSpanProcessor)
    processor.shutdown()


def test_otlp_exporter_rejects_external_endpoint_and_unbounded_batch() -> None:
    with pytest.raises(ValueError, match="internal collector"):
        TracingSettings(enabled=True, exporter=TraceExporters.OTLP, otlp_endpoint="https://example.com:4317")
    with pytest.raises(ValueError, match="batch cannot exceed queue"):
        TracingSettings(
            enabled=True,
            exporter=TraceExporters.OTLP,
            max_queue_size=64,
            max_export_batch_size=128,
        )


def test_tracer_shutdown_flushes_and_closes_provider() -> None:
    exporter, provider = tracing_fixture()
    with tracer_for(provider).start_as_current_span("shutdown-probe"):
        pass

    shutdown_tracer_provider(provider)

    assert exporter.get_finished_spans()[0].name == "shutdown-probe"
