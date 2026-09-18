package mediamtx

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type WebRTCSessionController interface {
	ListWebRTCPublishSessions(context.Context) ([]WebRTCPublishSession, error)
	KickWebRTCSession(context.Context, string) error
}

type PublishSessionRevocationObserver struct {
	control   WebRTCSessionController
	store     domain.PublishSessionStore
	validator domain.SessionBindingValidator
	interval  time.Duration
	timeout   time.Duration
	now       func() time.Time
}

func NewPublishSessionRevocationObserver(
	control WebRTCSessionController,
	store domain.PublishSessionStore,
	validator domain.SessionBindingValidator,
	interval time.Duration,
) PublishSessionRevocationObserver {
	return PublishSessionRevocationObserver{
		control: control, store: store, validator: validator, interval: interval,
		timeout: 2 * time.Second, now: time.Now,
	}
}

func (o PublishSessionRevocationObserver) Run(ctx context.Context) {
	ticker := time.NewTicker(o.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			o.reconcile(ctx)
		}
	}
}

func (o PublishSessionRevocationObserver) reconcile(ctx context.Context) {
	queryContext, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()
	sessions, err := o.control.ListWebRTCPublishSessions(queryContext)
	if err != nil {
		log.Printf("publish_session_revocation result=list_failed error_type=%T", err)
		return
	}
	for _, active := range sessions {
		o.reconcileSession(ctx, active)
	}
}

func (o PublishSessionRevocationObserver) reconcileSession(ctx context.Context, active WebRTCPublishSession) {
	parsed, err := domain.ParseStreamPath(active.Path)
	if err != nil {
		return
	}
	session, err := o.store.FindByStream(ctx, parsed.StreamID)
	if errors.Is(err, domain.ErrPublishSessionNotFound) {
		return
	}
	if err == nil && session.Path == active.Path && session.ActiveAt(o.now()) && o.validator != nil {
		if o.validator.ValidateSessionBinding(ctx, session) == nil {
			return
		}
	}
	kickContext, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()
	if kickErr := o.control.KickWebRTCSession(kickContext, active.ID); kickErr != nil {
		log.Printf("publish_session_revocation result=kick_failed error_type=%T", kickErr)
		return
	}
	log.Printf("publish_session_revocation result=revoked")
}
