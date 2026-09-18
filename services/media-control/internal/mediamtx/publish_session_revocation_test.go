package mediamtx

import (
	"context"
	"errors"
	"net/url"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

const revocationTestSecret = "test-revocation-secret"

type revocationControl struct {
	sessions []WebRTCSession
	kicked   []string
}

func (c *revocationControl) ListWebRTCSessions(context.Context) ([]WebRTCSession, error) {
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
			GroupID: "co-a", Status: domain.PublishSessionActive, PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Minute)},
		{SessionID: "stale", StreamID: "raw.device.stale", Path: "raw/device/stale", PrincipalID: "stale-user",
			GroupID: "co-a", Status: domain.PublishSessionActive, PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Minute)},
	} {
		if err := store.Save(context.Background(), session); err != nil {
			t.Fatal(err)
		}
	}
	active, _ := store.Find(context.Background(), "active")
	stale, _ := store.Find(context.Background(), "stale")
	control := &revocationControl{sessions: []WebRTCSession{
		boundWebRTCSession(t, "keep", "publish", active, now), boundWebRTCSession(t, "kick", "publish", stale, now),
		{ID: "legacy", State: "publish", Path: "raw/local/webcam"},
	}}
	observer := NewPublishSessionRevocationObserver(control, store, revocationValidator{stalePrincipal: "stale-user"}, revocationTestSecret, time.Second)
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
		GroupID: "co-a", Status: domain.PublishSessionActive, PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Minute)}
	active := boundWebRTCSession(t, "ended", "publish", session, now)
	session.Status = domain.PublishSessionEnded
	if err := store.Save(context.Background(), session); err != nil {
		t.Fatal(err)
	}
	control := &revocationControl{sessions: []WebRTCSession{active}}
	observer := NewPublishSessionRevocationObserver(control, store, revocationValidator{}, revocationTestSecret, time.Second)
	observer.now = func() time.Time { return now }

	observer.reconcile(context.Background())

	if len(control.kicked) != 1 || control.kicked[0] != "ended" {
		t.Fatalf("ended publisher was not kicked: %#v", control.kicked)
	}
}

func TestPublishSessionRevocationKicksStaleTalkbackReader(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	session := domain.PublishSession{
		SessionID: "reader", StreamID: "talkback.raw.device.front.operator", Path: "talkback/raw/device/front/operator",
		GroupID: "co-a", PrincipalID: "stale-reader", Status: domain.PublishSessionActive,
		PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Minute),
	}
	if err := store.Save(context.Background(), session); err != nil {
		t.Fatal(err)
	}
	control := &revocationControl{sessions: []WebRTCSession{boundWebRTCSession(t, "reader", "read", session, now)}}
	observer := NewPublishSessionRevocationObserver(
		control, store, revocationValidator{stalePrincipal: "stale-reader"}, revocationTestSecret, time.Second,
	)
	observer.now = func() time.Time { return now }

	observer.reconcile(context.Background())

	if len(control.kicked) != 1 || control.kicked[0] != "reader" {
		t.Fatalf("stale talkback reader was not kicked: %#v", control.kicked)
	}
}

func boundWebRTCSession(t *testing.T, id string, state string, session domain.PublishSession, now time.Time) WebRTCSession {
	t.Helper()
	action, key := "playback", "playbackToken"
	if state == "publish" {
		action, key = "publish", "publisherToken"
	}
	token, err := sessiontoken.IssueBound(revocationTestSecret, session, action, "jti-"+id, now)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := sessiontoken.ValidateForRoute(revocationTestSecret, token, action, session.StreamID, session.Path, now)
	if err != nil || !sessiontoken.MatchesSession(payload, session) {
		t.Fatalf("issued fixture token does not match session: payload=%#v err=%v", payload, err)
	}
	return WebRTCSession{ID: id, State: state, Path: session.Path, Query: url.Values{key: []string{token}}.Encode()}
}
