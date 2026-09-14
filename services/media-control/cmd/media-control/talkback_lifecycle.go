package main

import (
	"context"
	"log"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
)

const talkbackLifecyclePollInterval = 2 * time.Second

func startTalkbackLifecycleObserver(ctx context.Context, config runtimeConfig, metrics *httpapi.Metrics) error {
	sink, err := authpolicy.NewLifecycleAuditSink(config.authPolicyBaseURL, config.auditIngestToken, nil)
	if err != nil {
		return err
	}
	observer := mediamtx.NewTalkbackLifecycleObserver(
		mediamtx.NewClient(config.mediaMTXBaseURL, nil), config.groupResolver,
		sink, talkbackLifecyclePollInterval,
	).WithMetrics(metrics)
	go observer.Run(ctx)
	log.Printf("talkback lifecycle observer started interval=%s", talkbackLifecyclePollInterval)
	return nil
}
