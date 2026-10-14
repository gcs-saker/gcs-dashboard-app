package observability

import (
	"bytes"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace/noop"
)

func TestInstallTracingConfiguresStdoutExporterAndTraceContextPropagator(t *testing.T) {
	var buffer bytes.Buffer
	shutdown, err := InstallTracing(TraceConfig{
		Exporter:    TraceExporterStdout,
		ServiceName: "test-media-control",
	}, &buffer)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = shutdown(context.Background())
		otel.SetTracerProvider(noop.NewTracerProvider())
	})

	ctx, span := otel.Tracer("test").Start(context.Background(), "operation")
	traceID := TraceIDFromContext(ctx)
	span.End()
	if traceID == "" {
		t.Fatal("expected trace id from active span context")
	}
	if err := shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(buffer.String(), traceID) {
		t.Fatalf("expected stdout trace exporter to contain trace id %s, got %s", traceID, buffer.String())
	}
}

func TestInstallTracingRejectsUnknownExporter(t *testing.T) {
	if _, err := InstallTracing(TraceConfig{Exporter: "jaeger-by-accident", ServiceName: "test"}, nil); err == nil {
		t.Fatal("expected unsupported exporter error")
	}
}

func TestInstallTracingRejectsExternalOTLPEndpointAndInvalidBounds(t *testing.T) {
	invalid := []TraceConfig{
		{Exporter: TraceExporterOTLP, OTLPEndpoint: "example.com:4317", ExportTimeout: time.Second, MaxQueueSize: 64, MaxExportBatch: 16},
		{Exporter: TraceExporterOTLP, OTLPEndpoint: "otel-collector:4317", ExportTimeout: time.Second, MaxQueueSize: 64, MaxExportBatch: 128},
	}
	for _, config := range invalid {
		if _, err := InstallTracing(config, nil); err == nil {
			t.Fatal("expected invalid OTLP configuration error")
		}
	}
}

func TestOTLPExporterDoesNotBlockSpanCompletionWhenCollectorIsDown(t *testing.T) {
	shutdown, err := InstallTracing(TraceConfig{
		Exporter:       TraceExporterOTLP,
		ServiceName:    "test-media-control",
		OTLPEndpoint:   "127.0.0.1:4317",
		ExportTimeout:  100 * time.Millisecond,
		MaxQueueSize:   64,
		MaxExportBatch: 16,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	for range 32 {
		_, span := otel.Tracer("test").Start(context.Background(), "fail-open-probe")
		span.End()
	}
	if elapsed := time.Since(started); elapsed > 500*time.Millisecond {
		t.Fatalf("span completion blocked on unavailable collector: %s", elapsed)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = shutdown(ctx)
}

func TestInstrumentHTTPClientAppliesBoundedDefaultAndPreservesConfiguredTimeout(t *testing.T) {
	defaultClient := InstrumentHTTPClient(nil, "test.operation")
	if defaultClient.Timeout != defaultHTTPTimeout {
		t.Fatalf("expected default timeout %s, got %s", defaultHTTPTimeout, defaultClient.Timeout)
	}

	configuredTimeout := 750 * time.Millisecond
	configured := &http.Client{Timeout: configuredTimeout}
	instrumented := InstrumentHTTPClient(configured, "test.operation")
	if instrumented.Timeout != configuredTimeout {
		t.Fatalf("expected configured timeout %s, got %s", configuredTimeout, instrumented.Timeout)
	}
	if instrumented == configured {
		t.Fatal("instrumentation must clone the caller-owned HTTP client")
	}
}
