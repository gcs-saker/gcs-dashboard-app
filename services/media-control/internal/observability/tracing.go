package observability

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
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
	TraceExporterOTLP   = "otlp"
	defaultServiceName  = "gcs-saker-media-control"
	defaultHTTPTimeout  = 3 * time.Second
	defaultBatchTimeout = 2 * time.Second
)

type ShutdownFunc func(context.Context) error

type TraceConfig struct {
	Exporter       string
	ServiceName    string
	OTLPEndpoint   string
	ExportTimeout  time.Duration
	MaxQueueSize   int
	MaxExportBatch int
}

func (c TraceConfig) validate() error {
	if c.Exporter != TraceExporterOTLP {
		return nil
	}
	if err := validateOTLPEndpoint(c.OTLPEndpoint); err != nil {
		return err
	}
	return validateOTLPBounds(c)
}

func validateOTLPEndpoint(endpoint string) error {
	host, port, err := net.SplitHostPort(endpoint)
	if err != nil || port != "4317" || (host != "otel-collector" && host != "127.0.0.1" && host != "localhost") {
		return fmt.Errorf("OTLP endpoint must use the internal collector boundary")
	}
	return nil
}

func validateOTLPBounds(config TraceConfig) error {
	if config.ExportTimeout <= 0 || config.ExportTimeout > 5*time.Second {
		return fmt.Errorf("OTLP export timeout must be between zero and five seconds")
	}
	if config.MaxQueueSize < 64 || config.MaxExportBatch < 1 || config.MaxExportBatch > config.MaxQueueSize {
		return fmt.Errorf("OTLP batch and queue bounds are invalid")
	}
	return nil
}

func InstallTracing(config TraceConfig, writer io.Writer) (ShutdownFunc, error) {
	otel.SetTextMapPropagator(
		propagation.NewCompositeTextMapPropagator(
			propagation.TraceContext{},
			propagation.Baggage{},
		),
	)

	exporterName := strings.TrimSpace(strings.ToLower(config.Exporter))
	if exporterName == "" || exporterName == TraceExporterNone {
		return func(context.Context) error { return nil }, nil
	}
	config.Exporter = exporterName
	if err := config.validate(); err != nil {
		return nil, err
	}
	if config.ServiceName == "" {
		config.ServiceName = defaultServiceName
	}

	exporter, err := newTraceExporter(config, writer)
	if err != nil {
		return nil, err
	}
	provider := sdktrace.NewTracerProvider(
		sdktrace.WithSpanProcessor(newSpanProcessor(config, exporter)),
		sdktrace.WithResource(resource.NewWithAttributes(
			"",
			attribute.String("service.name", config.ServiceName),
		)),
	)
	otel.SetTracerProvider(provider)
	return provider.Shutdown, nil
}

func newTraceExporter(config TraceConfig, writer io.Writer) (sdktrace.SpanExporter, error) {
	if config.Exporter == TraceExporterStdout {
		options := []stdouttrace.Option{stdouttrace.WithPrettyPrint()}
		if writer != nil {
			options = append(options, stdouttrace.WithWriter(writer))
		}
		return stdouttrace.New(options...)
	}
	if config.Exporter != TraceExporterOTLP {
		return nil, fmt.Errorf("unsupported media-control trace exporter %q", config.Exporter)
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.ExportTimeout)
	defer cancel()
	return otlptracegrpc.New(
		ctx,
		otlptracegrpc.WithEndpoint(config.OTLPEndpoint),
		otlptracegrpc.WithInsecure(),
		otlptracegrpc.WithTimeout(config.ExportTimeout),
		otlptracegrpc.WithRetry(otlptracegrpc.RetryConfig{Enabled: false}),
	)
}

func newSpanProcessor(config TraceConfig, exporter sdktrace.SpanExporter) sdktrace.SpanProcessor {
	if config.Exporter != TraceExporterOTLP {
		return sdktrace.NewSimpleSpanProcessor(exporter)
	}
	return sdktrace.NewBatchSpanProcessor(
		exporter,
		sdktrace.WithMaxQueueSize(config.MaxQueueSize),
		sdktrace.WithMaxExportBatchSize(config.MaxExportBatch),
		sdktrace.WithBatchTimeout(defaultBatchTimeout),
		sdktrace.WithExportTimeout(config.ExportTimeout),
	)
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
