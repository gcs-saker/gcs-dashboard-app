package main

import (
	"context"
	"log"
	"sync"
	"time"
)

const publishSessionStatisticsInterval = 30 * time.Second
const publishSessionMaximumAge = 46 * time.Minute

type publishSessionReadiness struct {
	mu     sync.RWMutex
	ready  bool
	reason string
}

func (r *publishSessionReadiness) Ready() (bool, string) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ready, r.reason
}

func (r *publishSessionReadiness) update(ready bool, reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready, r.reason = ready, reason
}

func startPublishSessionStatistics(ctx context.Context, resources runtimeResources, readiness *publishSessionReadiness) {
	go func() {
		ticker := time.NewTicker(publishSessionStatisticsInterval)
		defer ticker.Stop()
		for {
			stats, err := resources.publishSessions.SnapshotStatistics(ctx, time.Now(), 1000)
			resources.metrics.ObservePublishSessionStatistics(
				stats.Active, stats.Ended, stats.Expired, stats.OldestAge, stats.Truncated, err,
			)
			ready, reason := classifyPublishSessionReadiness(stats.OldestAge, stats.Truncated, err)
			readiness.update(ready, reason)
			if !ready {
				log.Printf("publish_session_statistics result=degraded reason=%s", reason)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func classifyPublishSessionReadiness(oldest time.Duration, truncated bool, err error) (bool, string) {
	if err != nil {
		return false, "store_unavailable"
	}
	if truncated {
		return false, "scan_truncated"
	}
	if oldest > publishSessionMaximumAge {
		return false, "session_age_exceeded"
	}
	return true, ""
}
