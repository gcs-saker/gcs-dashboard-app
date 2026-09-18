package main

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
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

func (r *publishSessionReadiness) update(ready bool, reason string) (bool, string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	changed, previous := r.ready != ready || r.reason != reason, r.reason
	r.ready, r.reason = ready, reason
	return changed, previous
}

func startPublishSessionStatistics(ctx context.Context, config runtimeConfig, resources runtimeResources, readiness *publishSessionReadiness) error {
	audit, err := authpolicy.NewLifecycleAuditSink(config.authPolicyBaseURL, config.auditIngestToken, nil)
	if err != nil {
		return err
	}
	go func() {
		ticker := time.NewTicker(publishSessionStatisticsInterval)
		defer ticker.Stop()
		for {
			stats, err := resources.publishSessions.SnapshotStatistics(ctx, time.Now(), 1000)
			resources.metrics.ObservePublishSessionStatistics(
				stats.Active, stats.Ended, stats.Expired, stats.OldestAge, stats.Truncated, err,
			)
			ready, reason := classifyPublishSessionReadiness(stats.OldestAge, stats.Truncated, err)
			changed, previous := readiness.update(ready, reason)
			if changed {
				log.Printf("publish_session_statistics result=%s reason=%s", readinessResult(ready), reason)
				auditReason := reason
				if ready {
					auditReason = previous
				}
				if auditErr := audit.RecordPublishSessionHealth(ctx, !ready, auditReason, time.Now().UTC()); auditErr != nil {
					log.Printf("publish_session_statistics result=audit_failed error_type=%T", auditErr)
				}
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	return nil
}

func readinessResult(ready bool) string {
	if ready {
		return "recovered"
	}
	return "degraded"
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
