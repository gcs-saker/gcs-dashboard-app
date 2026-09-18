package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
)

const publishSessionRevocationInterval = 2 * time.Second

func startPublishSessionRevocationObserver(ctx context.Context, config runtimeConfig, resources runtimeResources) error {
	if resources.gateway.rpc == nil {
		return fmt.Errorf("publish session revocation requires policy RPC")
	}
	observer := mediamtx.NewPublishSessionRevocationObserver(
		mediamtx.NewClient(config.mediaMTXBaseURL, nil), resources.publishSessions,
		resources.gateway.rpc, config.publishToken, publishSessionRevocationInterval,
	).WithMetrics(resources.metrics)
	audit, err := authpolicy.NewLifecycleAuditSink(config.authPolicyBaseURL, config.auditIngestToken, nil)
	if err != nil {
		return err
	}
	observer = observer.WithAuditSink(audit)
	go observer.Run(ctx)
	log.Printf("publish session revocation observer started interval=%s", publishSessionRevocationInterval)
	return nil
}
