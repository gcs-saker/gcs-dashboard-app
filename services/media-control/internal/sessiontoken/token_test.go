package sessiontoken

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const testSecret = "test-secret-at-least-32-characters"

func TestLegacyTokenValidatesExactScopeAndExpiry(t *testing.T) {
	now := time.Now()
	token, err := Issue(testSecret, "playback", "raw.sample.front", "raw/sample/front", "co-a", now)
	if err != nil {
		t.Fatal(err)
	}
	if err := Validate(testSecret, token, "playback", "raw.sample.front", "raw/sample/front", "co-a", now); err != nil {
		t.Fatal(err)
	}
	for _, input := range []struct{ action, streamID, path, group string }{
		{"publish", "raw.sample.front", "raw/sample/front", "co-a"},
		{"playback", "raw.other.front", "raw/sample/front", "co-a"},
		{"playback", "raw.sample.front", "raw/other/front", "co-a"},
		{"playback", "raw.sample.front", "raw/sample/front", "co-b"},
	} {
		if Validate(testSecret, token, input.action, input.streamID, input.path, input.group, now) == nil {
			t.Fatalf("mismatched scope accepted: %#v", input)
		}
	}
	if Validate(testSecret, token, "playback", "raw.sample.front", "raw/sample/front", "co-a", now.Add(TTL)) == nil {
		t.Fatal("expired token accepted")
	}
}

func TestBoundTokenMatchesAuthoritativeSession(t *testing.T) {
	now := time.Now()
	session := activeSession(now)
	token, err := IssueDevice(testSecret, session, "jti-1", now)
	if err != nil {
		t.Fatal(err)
	}
	payload, err := ValidateForRoute(testSecret, token, RouteValidation{
		Action: "publish", StreamID: session.StreamID, StreamPath: session.Path, Now: now, EnforceExpiry: true,
	})
	if err != nil || !MatchesSession(payload, session) {
		t.Fatalf("bound token mismatch: payload=%#v err=%v", payload, err)
	}
	if _, err := ValidatePublishSession(testSecret, token, session.SessionID, now); err != nil {
		t.Fatal(err)
	}
	session.CredentialVersion++
	if MatchesSession(payload, session) {
		t.Fatal("changed credential binding accepted")
	}
}

func TestTokenRejectsInvalidInputsAndTampering(t *testing.T) {
	now := time.Now()
	if _, err := Issue("", "publish", "stream", "raw/a/b", "co-a", now); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty secret error=%v", err)
	}
	if _, err := IssueDevice(testSecret, domain.PublishSession{}, "jti", now); !errors.Is(err, ErrInvalid) {
		t.Fatalf("inactive session error=%v", err)
	}
	token, err := IssueDevice(testSecret, activeSession(now), "jti-2", now)
	if err != nil {
		t.Fatal(err)
	}
	replacement := "A"
	if strings.HasSuffix(token, replacement) {
		replacement = "B"
	}
	tampered := token[:len(token)-1] + replacement
	if _, err := ValidateForRoute(testSecret, tampered, RouteValidation{Action: "publish"}); err == nil {
		t.Fatal("tampered token accepted")
	}
	if _, err := ValidateForRoute("different-secret-at-least-32-chars", token, RouteValidation{Action: "publish"}); err == nil {
		t.Fatal("wrong secret accepted")
	}
}

func activeSession(now time.Time) domain.PublishSession {
	return domain.PublishSession{
		SessionID: "session-1", DeviceUUID: "device-1", SensorID: "front", StreamID: "raw.device.front",
		Path: "raw/device/front", GroupID: "co-a", CredentialVersion: 1, DevicePolicyVersion: 2,
		Status: domain.PublishSessionActive, PublishTokenExpiresAt: now.Add(time.Minute),
		RenewalTokenExpiresAt: now.Add(time.Hour),
	}
}
