package mediamtx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

func TestListStreamsMapsMediaMTXPaths(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/paths/list" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"items":[{"name":"raw/local/webcam","ready":true,"source":{"type":"rtspSession","id":"session-1"},"readers":[{"type":"webRTCSession"},{"type":"hlsMuxer"}]}]}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	streams, err := client.ListStreams(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected one stream, got %d", len(streams))
	}
	if !streams[0].Ready || streams[0].ReaderCount != 2 || streams[0].Source != "rtspSession" {
		t.Fatalf("unexpected stream descriptor: %+v", streams[0])
	}
}

func TestListStreamsReturnsStatusError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	_, err := client.ListStreams(context.Background())
	if err == nil {
		t.Fatal("expected mediamtx status error")
	}
}

func TestListStreamsPropagatesTraceParentToMediaMTX(t *testing.T) {
	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() {
		_ = tp.Shutdown(context.Background())
		otel.SetTracerProvider(noop.NewTracerProvider())
	})

	var observedTraceParent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observedTraceParent = r.Header.Get("traceparent")
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	defer server.Close()

	ctx, span := otel.Tracer("test").Start(context.Background(), "incoming-request")
	defer span.End()
	client := NewClient(server.URL, server.Client())
	if _, err := client.ListStreams(ctx); err != nil {
		t.Fatal(err)
	}

	traceID := span.SpanContext().TraceID().String()
	if observedTraceParent == "" || !strings.Contains(observedTraceParent, traceID) {
		t.Fatalf("expected outbound traceparent to contain trace id %s, got %q", traceID, observedTraceParent)
	}
}
