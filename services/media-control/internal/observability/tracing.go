package observability

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const (
	TraceParentHeader   = "traceparent"
	TraceStateHeader    = "tracestate"
	TraceExporterNone   = "none"
	TraceExporterStdout = "stdout"
	defaultServiceName  = "gcs-saker-media-control"
	defaultHTTPTimeout  = 3 * time.Second
)

type ShutdownFunc func(context.Context) error

func InstallTracing(exporterName string, serviceName string, writer io.Writer) (ShutdownFunc, error) {
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	exporterName = strings.TrimSpace(strings.ToLower(exporterName))
	if exporterName == "" || exporterName == TraceExporterNone {
		return func(context.Context) error { return nil }, nil
	}
	if serviceName == "" {
		serviceName = defaultServiceName
	}

	var exporter sdktrace.SpanExporter
	var err error
	switch exporterName {
	case TraceExporterStdout:
		options := []stdouttrace.Option{stdouttrace.WithPrettyPrint()}
		if writer != nil {
			options = append(options, stdouttrace.WithWriter(writer))
		}
		exporter, err = stdouttrace.New(options...)
	default:
		return nil, fmt.Errorf("unsupported media-control trace exporter %q", exporterName)
	}
	if err != nil {
		return nil, err
	}

	provider := sdktrace.NewTracerProvider(
		sdktrace.WithSyncer(exporter),
		sdktrace.WithResource(resource.NewWithAttributes(
			"",
			attribute.String("service.name", serviceName),
		)),
	)
	otel.SetTracerProvider(provider)
	return provider.Shutdown, nil
}

func InstrumentHTTPClient(client *http.Client, operation string) *http.Client {
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	clone := *client
	clone.Transport = otelhttp.NewTransport(
		client.Transport,
		otelhttp.WithSpanNameFormatter(func(_ string, _ *http.Request) string {
			return operation
		}),
	)
	return &clone
}

func TraceIDFromContext(ctx context.Context) string {
	spanContext := trace.SpanContextFromContext(ctx)
	if !spanContext.HasTraceID() {
		return ""
	}
	return spanContext.TraceID().String()
}
