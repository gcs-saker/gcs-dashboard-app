package streamcache

import (
	"context"
	"errors"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type PresenceStore struct {
	cache  StringCache
	prefix string
	ttl    time.Duration
}

func NewPresenceStore(cache StringCache, prefix string, ttl time.Duration) PresenceStore {
	return PresenceStore{cache: cache, prefix: prefix, ttl: ttl}
}

func (s PresenceStore) Enabled() bool {
	return s.cache != nil && s.ttl > 0 && s.prefix != ""
}

func (s PresenceStore) Store(ctx context.Context, streams domain.StreamList) error {
	if !s.Enabled() {
		return nil
	}
	var storeErrors []error
	streams.ForEach(func(stream domain.StreamDescriptor) {
		if stream.Status == domain.StreamStatusUnknown {
			return
		}
		if err := s.cache.Set(ctx, s.prefix+string(stream.Path), string(stream.Status), s.ttl); err != nil {
			storeErrors = append(storeErrors, err)
		}
	})
	return errors.Join(storeErrors...)
}
