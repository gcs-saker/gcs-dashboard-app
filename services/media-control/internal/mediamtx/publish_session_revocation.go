package mediamtx

import (
	"context"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

type WebRTCSessionController interface {
	ListWebRTCSessions(context.Context) ([]WebRTCSession, error)
	KickWebRTCSession(context.Context, string) error
}

type SessionRevocationMetrics interface {
	ObserveSessionRevocationScan(error, time.Duration, int)
	ObserveSessionRevocation(string, string, time.Duration)
}

type SessionRevocationEvent struct {
	Reference  string
	GroupID    string
	Operation  string
	OccurredAt time.Time
}

type SessionRevocationAuditSink interface {
	RecordSessionRevocation(context.Context, SessionRevocationEvent) error
}

type PublishSessionRevocationObserver struct {
	control   WebRTCSessionController
	store     domain.PublishSessionStore
	validator domain.SessionBindingValidator
	interval  time.Duration
	timeout   time.Duration
	now       func() time.Time
	secret    string
	metrics   SessionRevocationMetrics
	audit     SessionRevocationAuditSink
}

func (o PublishSessionRevocationObserver) WithMetrics(metrics SessionRevocationMetrics) PublishSessionRevocationObserver {
	o.metrics = metrics
	return o
}

func (o PublishSessionRevocationObserver) WithAuditSink(audit SessionRevocationAuditSink) PublishSessionRevocationObserver {
	o.audit = audit
	return o
}

func NewPublishSessionRevocationObserver(
	control WebRTCSessionController,
	store domain.PublishSessionStore,
	validator domain.SessionBindingValidator,
	secret string,
	interval time.Duration,
) PublishSessionRevocationObserver {
	return PublishSessionRevocationObserver{
		control: control, store: store, validator: validator, secret: secret, interval: interval,
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
	started := time.Now()
	queryContext, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()
	sessions, err := o.control.ListWebRTCSessions(queryContext)
	if o.metrics != nil {
		o.metrics.ObserveSessionRevocationScan(err, time.Since(started), len(sessions))
	}
	if err != nil {
		log.Printf("publish_session_revocation result=list_failed error_type=%T", err)
		return
	}
	for _, active := range sessions {
		o.reconcileSession(ctx, active)
	}
}

func (o PublishSessionRevocationObserver) reconcileSession(ctx context.Context, active WebRTCSession) {
	started := time.Now()
	result := "ignored"
	defer func() {
		if o.metrics != nil {
			o.metrics.ObserveSessionRevocation(active.State, result, time.Since(started))
		}
	}()
	parsed, err := domain.ParseStreamPath(active.Path)
	if err != nil {
		return
	}
	token, managed, tokenErr := o.boundSessionToken(active, parsed)
	if !managed {
		return
	}
	if tokenErr == nil && o.sessionBindingIsCurrent(ctx, active, token) {
		result = "retained"
		return
	}
	kickContext, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()
	if kickErr := o.control.KickWebRTCSession(kickContext, active.ID); kickErr != nil {
		result = "kick_failed"
		log.Printf("publish_session_revocation result=kick_failed error_type=%T", kickErr)
		return
	}
	result = "revoked"
	if o.recordRevocation(ctx, active, token) != nil {
		result = "audit_failed"
	}
	log.Printf("publish_session_revocation result=revoked")
}

func (o PublishSessionRevocationObserver) recordRevocation(
	ctx context.Context,
	active WebRTCSession,
	token sessiontoken.Payload,
) error {
	if o.audit == nil {
		return nil
	}
	event := SessionRevocationEvent{
		Reference: hashReference(active.Path + ":" + active.ID), GroupID: token.GroupID,
		Operation: "media.session.revoked", OccurredAt: o.now().UTC(),
	}
	if err := o.audit.RecordSessionRevocation(ctx, event); err != nil {
		log.Printf("publish_session_revocation result=audit_failed error_type=%T", err)
		return err
	}
	return nil
}

func (o PublishSessionRevocationObserver) sessionBindingIsCurrent(
	ctx context.Context,
	active WebRTCSession,
	token sessiontoken.Payload,
) bool {
	session, err := o.store.Find(ctx, token.SessionID)
	if err != nil || session.Path != active.Path || !session.ActiveAt(o.now()) {
		return false
	}
	if !sessiontoken.MatchesSession(token, session) || o.validator == nil {
		return false
	}
	return o.validator.ValidateSessionBinding(ctx, session) == nil
}

func (o PublishSessionRevocationObserver) boundSessionToken(
	active WebRTCSession,
	parsed domain.ParsedStreamPath,
) (sessiontoken.Payload, bool, error) {
	values, err := url.ParseQuery(strings.TrimPrefix(active.Query, "?"))
	if err != nil {
		return sessiontoken.Payload{}, true, err
	}
	action, key := "playback", "playbackToken"
	if active.State == "publish" {
		action, key = "publish", "publisherToken"
	}
	raw := values.Get(key)
	if raw == "" {
		return sessiontoken.Payload{}, false, nil
	}
	token, err := sessiontoken.ValidateForRoute(o.secret, raw, sessiontoken.RouteValidation{
		Action: action, StreamID: parsed.StreamID, StreamPath: active.Path,
	})
	if err != nil {
		return sessiontoken.Payload{}, true, err
	}
	return token, token.SessionID != "", nil
}
