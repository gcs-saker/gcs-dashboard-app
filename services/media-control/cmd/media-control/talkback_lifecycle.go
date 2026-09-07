package main

import (
	"context"
	"log"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
)

const talkbackLifecyclePollInterval = 2 * time.Second

type structuredTalkbackLifecycleSink struct{}

func (structuredTalkbackLifecycleSink) RecordTalkbackLifecycle(_ context.Context, event mediamtx.TalkbackLifecycleEvent) error {
	log.Printf(
		"audit_event service=media-control operation=%s result=observed group=%s session_ref=%s occurred_at=%s",
		event.Operation, event.GroupID, event.Reference, event.OccurredAt.Format(time.RFC3339Nano),
	)
	return nil
}

func startTalkbackLifecycleObserver(ctx context.Context, config runtimeConfig) {
	observer := mediamtx.NewTalkbackLifecycleObserver(
		mediamtx.NewClient(config.mediaMTXBaseURL, nil), config.groupResolver,
		structuredTalkbackLifecycleSink{}, talkbackLifecyclePollInterval,
	)
	go observer.Run(ctx)
}
