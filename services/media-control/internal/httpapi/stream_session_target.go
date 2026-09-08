package httpapi

import (
	"context"
	"errors"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const sessionLookupTimeout = 3 * time.Second

// Production stream scope comes from the server-owned session, never the media path.
func (s Server) resolveStreamTarget(ctx context.Context, parsed domain.ParsedStreamPath) (domain.StreamAccessTarget, error) {
	if s.publishSessions == nil {
		return domain.StreamAccessTarget{}, domain.ErrStreamAccessDenied
	}
	ctx, cancel := context.WithTimeout(ctx, sessionLookupTimeout)
	defer cancel()
	session, err := s.publishSessions.FindByStream(ctx, parsed.StreamID)
	if errors.Is(err, domain.ErrPublishSessionNotFound) {
		return domain.StreamAccessTarget{}, domain.ErrStreamAccessDenied
	}
	if err != nil {
		return domain.StreamAccessTarget{}, err
	}
	if !session.ActiveAt(s.now()) || session.Path != parsed.Path || session.GroupID == "" {
		return domain.StreamAccessTarget{}, domain.ErrStreamAccessDenied
	}
	if s.sessionValidator != nil && session.CredentialVersion > 0 {
		if err := s.sessionValidator.ValidateSessionBinding(ctx, session); err != nil {
			return domain.StreamAccessTarget{}, domain.ErrStreamAccessDenied
		}
	}
	return domain.StreamAccessTarget{
		StreamID: parsed.StreamID, Path: parsed.Path, PublisherGroupID: session.GroupID,
	}, nil
}
