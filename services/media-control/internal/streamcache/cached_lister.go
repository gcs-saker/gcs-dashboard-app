package streamcache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type StreamLister interface {
	ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error)
}

type StringCache interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
}

type CachedStreamLister struct {
	upstream       StreamLister
	cache          StringCache
	listKey        string
	presencePrefix string
	listTTL        time.Duration
	presenceTTL    time.Duration
}

func NewCachedStreamLister(
	upstream StreamLister,
	cache StringCache,
	listKey string,
	presencePrefix string,
	listTTL time.Duration,
	presenceTTL time.Duration,
) CachedStreamLister {
	return CachedStreamLister{
		upstream:       upstream,
		cache:          cache,
		listKey:        listKey,
		presencePrefix: presencePrefix,
		listTTL:        listTTL,
		presenceTTL:    presenceTTL,
	}
}

func (l CachedStreamLister) ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error) {
	if l.cache != nil && l.listTTL > 0 && l.listKey != "" {
		if cached, ok, err := l.cache.Get(ctx, l.listKey); err == nil && ok {
			var streams []domain.StreamDescriptor
			if json.Unmarshal([]byte(cached), &streams) == nil {
				return streams, nil
			}
		}
	}

	streams, err := l.upstream.ListStreams(ctx)
	if err != nil {
		return nil, err
	}
	l.store(ctx, streams)
	return streams, nil
}

func (l CachedStreamLister) store(ctx context.Context, streams []domain.StreamDescriptor) {
	if l.cache == nil {
		return
	}
	if l.listTTL > 0 && l.listKey != "" {
		if payload, err := json.Marshal(streams); err == nil {
			_ = l.cache.Set(ctx, l.listKey, string(payload), l.listTTL)
		}
	}
	if l.presenceTTL <= 0 || l.presencePrefix == "" {
		return
	}
	for _, stream := range streams {
		if stream.Status != domain.StreamStatusOnline {
			continue
		}
		_ = l.cache.Set(ctx, l.presencePrefix+string(stream.Path), string(stream.Status), l.presenceTTL)
	}
}
