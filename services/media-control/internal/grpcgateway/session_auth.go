package grpcgateway

import (
	"context"
	"fmt"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

type PublishSessionAuthenticator struct {
	Store     domain.PublishSessionStore
	Validator domain.SessionBindingValidator
	Secret    string
	Now       func() time.Time
}

func (a PublishSessionAuthenticator) AuthenticateSession(ctx context.Context, credentials GatewayCredentials) (GatewayIdentity, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	now := a.Now()
	payload, err := sessiontoken.ValidatePublishSession(a.Secret, credentials.Token, credentials.SessionID, now)
	if err != nil {
		return GatewayIdentity{}, err
	}
	session, err := a.Store.Find(ctx, credentials.SessionID)
	if err != nil {
		return GatewayIdentity{}, err
	}
	if !session.ActiveAt(now) || !sessiontoken.MatchesSession(payload, session) {
		return GatewayIdentity{}, fmt.Errorf("session binding invalid")
	}
	current, err := a.Store.FindByStream(ctx, session.StreamID)
	if err != nil || current.SessionID != session.SessionID {
		return GatewayIdentity{}, fmt.Errorf("session superseded")
	}
	if a.Validator == nil {
		return GatewayIdentity{}, fmt.Errorf("binding validator unavailable")
	}
	if err := a.Validator.ValidateSessionBinding(ctx, session); err != nil {
		return GatewayIdentity{}, err
	}
	return GatewayIdentity{DeviceUUID: session.DeviceUUID, GroupID: session.GroupID,
		CredentialVersion: session.CredentialVersion, PolicyVersion: session.DevicePolicyVersion, Session: &session}, nil
}
