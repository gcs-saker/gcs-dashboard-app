package streamcache

import (
	"context"
	"encoding/json"
	"sync"
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

type Observer interface {
	ObserveStreamCache(result string)
}

const (
	CacheResultHit      = "hit"
	CacheResultMiss     = "miss"
	CacheResultDegraded = "degraded"
)

type CachedStreamLister struct {
	upstream       StreamLister
	cache          StringCache
	listKey        string
	presencePrefix string
	listTTL        time.Duration
	presenceTTL    time.Duration
	refreshMu      *sync.Mutex
	observer       Observer
}

func NewCachedStreamLister(
	upstream StreamLister,
	cache StringCache,
	listKey string,
	presencePrefix string,
	listTTL time.Duration,
	presenceTTL time.Duration,
) CachedStreamLister {
	return NewCachedStreamListerWithObserver(upstream, cache, listKey, presencePrefix, listTTL, presenceTTL, nil)
}

func NewCachedStreamListerWithObserver(
	upstream StreamLister,
	cache StringCache,
	listKey string,
	presencePrefix string,
	listTTL time.Duration,
	presenceTTL time.Duration,
	observer Observer,
) CachedStreamLister {
	return CachedStreamLister{
		upstream:       upstream,
		cache:          cache,
		listKey:        listKey,
		presencePrefix: presencePrefix,
		listTTL:        listTTL,
		presenceTTL:    presenceTTL,
		refreshMu:      &sync.Mutex{},
		observer:       observer,
	}
}

func (l CachedStreamLister) ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error) {
	if streams, ok := l.loadCached(ctx); ok {
		return streams, nil
	}
	l.refreshMu.Lock()
	defer l.refreshMu.Unlock()
	if streams, ok := l.loadCached(ctx); ok {
		return streams, nil
	}

	streams, err := l.upstream.ListStreams(ctx)
	if err != nil {
		return nil, err
	}
	streamList := domain.NewStreamList(streams)
	l.store(ctx, streamList)
	return streamList.Values(), nil
}

func (l CachedStreamLister) loadCached(ctx context.Context) ([]domain.StreamDescriptor, bool) {
	if l.cache != nil && l.listTTL > 0 && l.listKey != "" {
		cached, ok, err := l.cache.Get(ctx, l.listKey)
		if err != nil {
			l.observe(CacheResultDegraded)
			return nil, false
		}
		if ok {
			var streams []domain.StreamDescriptor
			if json.Unmarshal([]byte(cached), &streams) == nil {
				l.observe(CacheResultHit)
				return domain.NewStreamList(streams).Values(), true
			}
			l.observe(CacheResultDegraded)
			return nil, false
		}
		l.observe(CacheResultMiss)
	}
	return nil, false
}

func (l CachedStreamLister) store(ctx context.Context, streams domain.StreamList) {
	if l.cache == nil {
		return
	}
	if l.listTTL > 0 && l.listKey != "" {
		if payload, err := json.Marshal(streams.Values()); err == nil {
			_ = l.cache.Set(ctx, l.listKey, string(payload), l.listTTL)
		}
	}
	if l.presenceTTL <= 0 || l.presencePrefix == "" {
		return
	}
	streams.ForEach(func(stream domain.StreamDescriptor) {
		if stream.Status == domain.StreamStatusUnknown {
			return
		}
		_ = l.cache.Set(ctx, l.presencePrefix+string(stream.Path), string(stream.Status), l.presenceTTL)
	})
}

func (l CachedStreamLister) observe(result string) {
	if l.observer != nil {
		l.observer.ObserveStreamCache(result)
	}
}
