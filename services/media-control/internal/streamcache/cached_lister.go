package streamcache

import (
	"context"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"go.opentelemetry.io/otel"
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
	traceCacheName      = "stream_list"
)

var tracer = otel.Tracer("gcs-saker/media-control/streamcache")

type CachedStreamLister struct {
	upstream       StreamLister
	cache          StringCache
	listKey        string
	presencePrefix string
	listTTL        time.Duration
	refreshMu      *sync.Mutex
	observer       Observer
	presence       PresenceStore
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
		refreshMu:      &sync.Mutex{},
		observer:       observer,
		presence:       NewPresenceStore(cache, presencePrefix, presenceTTL),
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

func (l CachedStreamLister) observe(result string) {
	if l.observer != nil {
		l.observer.ObserveStreamCache(result)
	}
}
