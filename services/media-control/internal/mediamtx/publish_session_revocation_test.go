package mediamtx

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type revocationControl struct {
	sessions []WebRTCPublishSession
	kicked   []string
}

func (c *revocationControl) ListWebRTCPublishSessions(context.Context) ([]WebRTCPublishSession, error) {
	return c.sessions, nil
}

func (c *revocationControl) KickWebRTCSession(_ context.Context, sessionID string) error {
	c.kicked = append(c.kicked, sessionID)
	return nil
}

type revocationValidator struct{ stalePrincipal string }

func (v revocationValidator) ValidateSessionBinding(_ context.Context, session domain.PublishSession) error {
	if session.PrincipalID == v.stalePrincipal {
		return errors.New("binding stale")
	}
	return nil
}

func TestPublishSessionRevocationKicksOnlyStaleOwnedPublisher(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	for _, session := range []domain.PublishSession{
		{SessionID: "active", StreamID: "raw.device.active", Path: "raw/device/active", PrincipalID: "active-user",
			Status: domain.PublishSessionActive, RenewalTokenExpiresAt: now.Add(time.Minute)},
		{SessionID: "stale", StreamID: "raw.device.stale", Path: "raw/device/stale", PrincipalID: "stale-user",
			Status: domain.PublishSessionActive, RenewalTokenExpiresAt: now.Add(time.Minute)},
	} {
		if err := store.Save(context.Background(), session); err != nil {
			t.Fatal(err)
		}
	}
	control := &revocationControl{sessions: []WebRTCPublishSession{
		{ID: "keep", Path: "raw/device/active"}, {ID: "kick", Path: "raw/device/stale"},
		{ID: "legacy", Path: "raw/local/webcam"},
	}}
	observer := NewPublishSessionRevocationObserver(control, store, revocationValidator{stalePrincipal: "stale-user"}, time.Second)
	observer.now = func() time.Time { return now }

	observer.reconcile(context.Background())

	if len(control.kicked) != 1 || control.kicked[0] != "kick" {
		t.Fatalf("expected only stale publisher to be kicked, got %#v", control.kicked)
	}
}

func TestPublishSessionRevocationKicksEndedSessionWithoutPolicyLookup(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	session := domain.PublishSession{SessionID: "ended", StreamID: "raw.device.ended", Path: "raw/device/ended",
		Status: domain.PublishSessionEnded, RenewalTokenExpiresAt: now.Add(time.Minute)}
	if err := store.Save(context.Background(), session); err != nil {
		t.Fatal(err)
	}
	control := &revocationControl{sessions: []WebRTCPublishSession{{ID: "ended", Path: session.Path}}}
	observer := NewPublishSessionRevocationObserver(control, store, revocationValidator{}, time.Second)
	observer.now = func() time.Time { return now }

	observer.reconcile(context.Background())

	if len(control.kicked) != 1 || control.kicked[0] != "ended" {
		t.Fatalf("ended publisher was not kicked: %#v", control.kicked)
	}
}
