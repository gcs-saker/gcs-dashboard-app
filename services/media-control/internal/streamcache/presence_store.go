package streamcache

import (
	"context"
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

func (s PresenceStore) Store(ctx context.Context, streams domain.StreamList) {
	if !s.Enabled() {
		return
	}
	streams.ForEach(func(stream domain.StreamDescriptor) {
		if stream.Status == domain.StreamStatusUnknown {
			return
		}
		_ = s.cache.Set(ctx, s.prefix+string(stream.Path), string(stream.Status), s.ttl)
	})
}
