package observability

import (
	"bytes"
	"context"
	"strings"
	"testing"

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
