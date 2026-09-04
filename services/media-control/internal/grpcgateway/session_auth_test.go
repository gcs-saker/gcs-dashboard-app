package grpcgateway

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

type testBindingValidator struct{ err error }

func (v testBindingValidator) ValidateSessionBinding(context.Context, domain.PublishSession) error {
	return v.err
}

func TestSessionAuthenticationRejectsInvalidBinding(t *testing.T) {
	now := time.Now()
	ctx := context.Background()
	session := domain.PublishSession{SessionID: "ps_first", DeviceUUID: "drone-1", SensorID: "front", StreamID: "raw.device.opaque",
		Path: "raw/device/opaque", GroupID: "co-a", CredentialVersion: 1, DevicePolicyVersion: 1, Status: domain.PublishSessionActive,
		CreatedAt: now.Add(-time.Second), PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Hour)}
	store := domain.NewInMemoryPublishSessionStore()
	if err := store.Save(ctx, session); err != nil {
		t.Fatal(err)
	}
	token, err := sessiontoken.IssueDevice("test-secret", session, "jti-test", now)
	if err != nil {
		t.Fatal(err)
	}
	auth := PublishSessionAuthenticator{Store: store, Validator: testBindingValidator{}, Secret: "test-secret", Now: func() time.Time { return now }}
	credentials := GatewayCredentials{SessionID: session.SessionID, Token: token}
	identity, err := auth.AuthenticateSession(ctx, credentials)
	if err != nil || identity.GroupID != "co-a" {
		t.Fatalf("valid session rejected: %v", err)
	}
	for _, invalid := range []GatewayCredentials{{SessionID: "ps_other", Token: token}, {SessionID: session.SessionID, Token: "forged"}} {
		if _, err := auth.AuthenticateSession(ctx, invalid); err == nil {
			t.Fatal("forged session accepted")
		}
	}
	auth.Validator = testBindingValidator{err: errors.New("policy changed")}
	if _, err := auth.AuthenticateSession(ctx, credentials); err == nil {
		t.Fatal("revoked binding accepted")
	}
	auth.Validator = testBindingValidator{}
	auth.Now = func() time.Time { return now.Add(2 * time.Minute) }
	if _, err := auth.AuthenticateSession(ctx, credentials); err == nil {
		t.Fatal("expired token accepted")
	}
	auth.Now = func() time.Time { return now }
	session.SessionID = "ps_second"
	if err := store.Save(ctx, session); err != nil {
		t.Fatal(err)
	}
	if _, err := auth.AuthenticateSession(ctx, credentials); err == nil {
		t.Fatal("superseded session accepted")
	}
}
