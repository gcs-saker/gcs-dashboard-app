package main

import (
	"context"
	"time"
)

const publishSessionStatisticsInterval = 30 * time.Second

func startPublishSessionStatistics(ctx context.Context, resources runtimeResources) {
	go func() {
		ticker := time.NewTicker(publishSessionStatisticsInterval)
		defer ticker.Stop()
		for {
			stats, err := resources.publishSessions.SnapshotStatistics(ctx, time.Now(), 1000)
			resources.metrics.ObservePublishSessionStatistics(
				stats.Active, stats.Ended, stats.Expired, stats.OldestAge, stats.Truncated, err,
			)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
