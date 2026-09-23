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

type revocationEvidence struct {
	scans    int
	outcomes []string
	events   []SessionRevocationEvent
}

func (e *revocationEvidence) ObserveSessionRevocationScan(error, time.Duration, int) { e.scans++ }
func (e *revocationEvidence) ObserveSessionRevocation(kind string, result string, _ time.Duration) {
	e.outcomes = append(e.outcomes, kind+":"+result)
}
func (e *revocationEvidence) RecordSessionRevocation(_ context.Context, event SessionRevocationEvent) error {
	e.events = append(e.events, event)
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
	renewed := domain.PublishSession{
		SessionID: "renewed", StreamID: "raw.device.renewed", Path: "raw/device/renewed",
		GroupID: "co-a", PrincipalID: "active-user", Status: domain.PublishSessionActive,
		PublishTokenExpiresAt: now.Add(-time.Minute), RenewalTokenExpiresAt: now.Add(time.Hour),
	}
	renewedActive := boundWebRTCSession(t, "renewed", "publish", renewed, now.Add(-2*time.Minute))
	renewed.PublishTokenExpiresAt = now.Add(30 * time.Minute)
	if err := store.Save(context.Background(), renewed); err != nil {
		t.Fatal(err)
	}
	control := &revocationControl{sessions: []WebRTCSession{
		boundWebRTCSession(t, "keep", "publish", active, now), boundWebRTCSession(t, "kick", "publish", stale, now),
		renewedActive,
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
	evidence := &revocationEvidence{}
	observer := NewPublishSessionRevocationObserver(
		control, store, revocationValidator{stalePrincipal: "stale-reader"}, revocationTestSecret, time.Second,
	).WithMetrics(evidence).WithAuditSink(evidence)
	observer.now = func() time.Time { return now }

	observer.reconcile(context.Background())

	if len(control.kicked) != 1 || control.kicked[0] != "reader" {
		t.Fatalf("stale talkback reader was not kicked: %#v", control.kicked)
	}
	if evidence.scans != 1 || len(evidence.outcomes) != 1 || evidence.outcomes[0] != "read:revoked" {
		t.Fatalf("revocation metrics evidence missing: %#v", evidence)
	}
	if len(evidence.events) != 1 || evidence.events[0].Operation != "media.session.revoked" || len(evidence.events[0].Reference) != 32 {
		t.Fatalf("bounded revocation audit evidence missing: %#v", evidence.events)
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
	payload, err := sessiontoken.ValidateForRoute(revocationTestSecret, token, sessiontoken.RouteValidation{
		Action: action, StreamID: session.StreamID, StreamPath: session.Path, Now: now, EnforceExpiry: true,
	})
	if err != nil || !sessiontoken.MatchesSession(payload, session) {
		t.Fatalf("issued fixture token does not match session: payload=%#v err=%v", payload, err)
	}
	return WebRTCSession{ID: id, State: state, Path: session.Path, Query: url.Values{key: []string{token}}.Encode()}
}
