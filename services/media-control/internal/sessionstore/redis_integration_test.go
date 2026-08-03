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
	if address == "" { t.Skip("TEST_REDIS_ADDR is not configured") }
	store := NewRedisStore(address, os.Getenv("TEST_REDIS_PASSWORD"), time.Second)
	ctx := context.Background()
	now := time.Now().UTC()
	session := domain.PublishSession{SessionID: "integration-session", DeviceUUID: "device-1", Status: domain.PublishSessionActive,
		RenewalTokenHash: []byte("old"), RenewalTokenVersion: 1, PublishTokenExpiresAt: now.Add(time.Minute),
		RenewalTokenExpiresAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now}
	if err := store.Save(ctx, session); err != nil { t.Fatal(err) }
	loaded, err := store.Find(ctx, session.SessionID)
	if err != nil || loaded.DeviceUUID != session.DeviceUUID { t.Fatalf("find: %#v %v", loaded, err) }
	rotated, result, err := store.RotateRenewal(ctx, session.SessionID, []byte("old"), []byte("new"), now.Add(2*time.Minute), now.Add(time.Hour), now)
	if err != nil || result != domain.RenewalRotated || rotated.RenewalTokenVersion != 2 { t.Fatalf("rotate: %s %#v %v", result, rotated, err) }
	if err := store.End(ctx, session.SessionID, now); err != nil { t.Fatal(err) }

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := store.Find(cancelled, session.SessionID); !errors.Is(err, domain.ErrPublishSessionStoreUnavailable) {
		t.Fatalf("cancelled find must expose dependency failure, got %v", err)
	}
}
