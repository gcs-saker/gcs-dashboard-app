package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/observability"
)

func main() {
	config, err := loadRuntimeConfig()
	if err != nil {
		log.Fatal(err)
	}
	traceShutdown, err := observability.InstallTracing(
		config.traceExporter,
		config.otelServiceName,
		nil,
	)
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = traceShutdown(ctx)
	}()

	authorizer, err := newAuthorizer(config)
	if err != nil {
		log.Fatal(err)
	}
	metrics := httpapi.NewMetrics()
	publishSessions, err := newPublishSessionStore(config)
	if err != nil {
		log.Fatal(err)
	}

	server := httpapi.NewServerWithMetrics(
		newStreamLister(config, metrics),
		newIceServerProvider(config, metrics),
		config.playback,
		&authorizer,
		config.groupResolver,
		config.publishToken,
		metrics,
	).WithDevicePublishAuthorizer(&authorizer).
		WithPublishSessionStore(publishSessions)

	grpcContext, stopGrpc := context.WithCancel(context.Background())
	defer stopGrpc()
	grpcReadiness := grpcgateway.StartWithReadiness(
		grpcContext,
		config.grpcListenAddress,
		config.grpcToken,
		config.grpcMaxPayloadBytes,
	)
	server = server.WithGatewayReadiness(grpcReadiness)

	log.Printf("media-control listening on %s", config.listenAddress)
	if err := http.ListenAndServe(config.listenAddress, server.Routes()); err != nil {
		log.Fatal(err)
	}
}
