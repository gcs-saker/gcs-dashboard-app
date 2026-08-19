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
	shutdown, err := InstallTracing(TraceExporterStdout, "test-media-control", &buffer)
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
	if _, err := InstallTracing("jaeger-by-accident", "test", nil); err == nil {
		t.Fatal("expected unsupported exporter error")
	}
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
