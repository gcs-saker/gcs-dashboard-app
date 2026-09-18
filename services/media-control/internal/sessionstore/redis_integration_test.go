package sessionstore

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestRedisStoreLifecycleAndCancellation(t *testing.T) {
	address := os.Getenv("TEST_REDIS_ADDR")
	if address == "" {
		t.Skip("TEST_REDIS_ADDR is not configured")
	}
	store := NewRedisStore(address, os.Getenv("TEST_REDIS_PASSWORD"), time.Second)
	ctx := context.Background()
	now := time.Now().UTC()
	session := domain.PublishSession{SessionID: "integration-session", DeviceUUID: "device-1", StreamID: "raw.device.integration", Path: "raw/device/integration", GroupID: "co-a", Status: domain.PublishSessionActive,
		RenewalTokenHash: []byte("old"), RenewalTokenVersion: 1, PublishTokenExpiresAt: now.Add(time.Minute),
		RenewalTokenExpiresAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now}
	if err := store.Save(ctx, session); err != nil {
		t.Fatal(err)
	}
	assertSessionTTL(t, store, ctx, keyPrefix+session.SessionID, time.Hour+sessionExpiryGrace)
	assertSessionTTL(t, store, ctx, streamIndexKey(session.StreamID), time.Hour+sessionExpiryGrace)
	loaded, err := store.Find(ctx, session.SessionID)
	if err != nil || loaded.DeviceUUID != session.DeviceUUID {
		t.Fatalf("find: %#v %v", loaded, err)
	}
	indexed, err := store.FindByStream(ctx, session.StreamID)
	if err != nil || indexed.SessionID != session.SessionID {
		t.Fatalf("stream index: %v", err)
	}
	rotated, result, err := store.RotateRenewal(ctx, session.SessionID, []byte("old"), []byte("new"), now.Add(2*time.Minute), now.Add(time.Hour), now)
	if err != nil || result != domain.RenewalRotated || rotated.RenewalTokenVersion != 2 {
		t.Fatalf("rotate: %s %#v %v", result, rotated, err)
	}
	if err := store.End(ctx, session.SessionID, now); err != nil {
		t.Fatal(err)
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := store.Find(cancelled, session.SessionID); !errors.Is(err, domain.ErrPublishSessionStoreUnavailable) {
		t.Fatalf("cancelled find must expose dependency failure, got %v", err)
	}
}

func assertSessionTTL(t *testing.T, store *RedisStore, ctx context.Context, key string, expected time.Duration) {
	t.Helper()
	ttl, err := store.client.TTL(ctx, key).Result()
	if err != nil {
		t.Fatal(err)
	}
	const tolerance = 5 * time.Second
	if ttl < expected-tolerance || ttl > expected+tolerance {
		t.Fatalf("unexpected bounded session TTL for key class: got %s want %s +/- %s", ttl, expected, tolerance)
	}
}
