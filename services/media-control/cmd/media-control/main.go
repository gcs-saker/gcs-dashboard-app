package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessionstore"
)

const (
	httpReadHeaderTimeout = 5 * time.Second
	httpReadTimeout       = 15 * time.Second
	httpWriteTimeout      = 15 * time.Second
	httpIdleTimeout       = 60 * time.Second
	shutdownTimeout       = 10 * time.Second
)

func main() {
	if err := run(); err != nil {
		log.Printf("media-control stopped error_code=runtime_failed error_type=%T", err)
		os.Exit(1)
	}
}

func run() error {
	config, err := loadRuntimeConfig()
	if err != nil {
		return err
	}
	traceShutdown, err := observability.InstallTracing(config.traceExporter, config.otelServiceName, nil)
	if err != nil {
		return err
	}
	defer shutdownTracing(traceShutdown)

	handler, resources, err := buildRuntime(config)
	if err != nil {
		return err
	}
	defer resources.Close()

	runtimeContext, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	grpcContext, stopGrpc := context.WithCancel(runtimeContext)
	defer stopGrpc()
	grpcReadiness := grpcgateway.StartDeviceWithReadiness(grpcContext, config.grpcListenAddress, resources.gateway.server)
	handler = handler.WithGatewayReadiness(grpcReadiness)
	return serveUntilShutdown(runtimeContext, newHTTPServer(config.listenAddress, handler.Routes()))
}

type runtimeResources struct {
	publishSessions *sessionstore.RedisStore
	gateway         gatewayRuntime
}

func (r runtimeResources) Close() {
	if err := r.gateway.Close(); err != nil {
		log.Printf("resource_close_failed component=gateway_redis error_type=%T", err)
	}
	if err := r.publishSessions.Close(); err != nil {
		log.Printf("resource_close_failed component=session_redis error_type=%T", err)
	}
}

func buildRuntime(config runtimeConfig) (httpapi.Server, runtimeResources, error) {
	authorizer, err := newAuthorizer(config)
	if err != nil {
		return httpapi.Server{}, runtimeResources{}, err
	}
	publishSessions, err := newPublishSessionStore(config)
	if err != nil {
		return httpapi.Server{}, runtimeResources{}, err
	}
	metrics := httpapi.NewMetrics()
	handler := httpapi.NewServerWithMetrics(
		newStreamLister(config, metrics), newIceServerProvider(config, metrics), config.playback,
		&authorizer, config.groupResolver, config.publishToken, metrics,
	).WithDevicePublishAuthorizer(&authorizer).
		WithAccountPublishAuthorizer(&authorizer).
		WithPublishSessionStore(publishSessions)
	gateway := newGatewayRuntime(config, metrics)
	return handler, runtimeResources{publishSessions: publishSessions, gateway: gateway}, nil
}

func newHTTPServer(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr: address, Handler: handler,
		ReadHeaderTimeout: httpReadHeaderTimeout, ReadTimeout: httpReadTimeout,
		WriteTimeout: httpWriteTimeout, IdleTimeout: httpIdleTimeout,
	}
}

func serveUntilShutdown(ctx context.Context, server *http.Server) error {
	errorsFromServer := make(chan error, 1)
	go func() { errorsFromServer <- server.ListenAndServe() }()
	log.Printf("media-control listening on %s", server.Addr)
	select {
	case err := <-errorsFromServer:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownContext, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownContext); err != nil {
			return fmt.Errorf("shutdown media-control HTTP server: %w", err)
		}
		return nil
	}
}

func shutdownTracing(shutdown observability.ShutdownFunc) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := shutdown(ctx); err != nil {
		log.Printf("resource_close_failed component=tracing error_type=%T", err)
	}
}
