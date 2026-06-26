package streamcache

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
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
		ctx, span := tracer.Start(ctx, "streamcache.get")
		defer span.End()
		span.SetAttributes(attribute.String("cache.name", traceCacheName))
		cached, ok, err := l.cache.Get(ctx, l.listKey)
		if err != nil {
			span.SetStatus(codes.Error, "cache degraded")
			span.SetAttributes(attribute.String("cache.result", CacheResultDegraded))
			l.observe(CacheResultDegraded)
			return nil, false
		}
		if ok {
			var streams []domain.StreamDescriptor
			if json.Unmarshal([]byte(cached), &streams) == nil {
				span.SetAttributes(attribute.String("cache.result", CacheResultHit))
				l.observe(CacheResultHit)
				return domain.NewStreamList(streams).Values(), true
			}
			span.SetStatus(codes.Error, "cache payload decode failed")
			span.SetAttributes(attribute.String("cache.result", CacheResultDegraded))
			l.observe(CacheResultDegraded)
			return nil, false
		}
		span.SetAttributes(attribute.String("cache.result", CacheResultMiss))
		l.observe(CacheResultMiss)
	}
	return nil, false
}

func (l CachedStreamLister) store(ctx context.Context, streams domain.StreamList) {
	if l.cache == nil {
		return
	}
	if l.listTTL > 0 && l.listKey != "" {
		ctx, span := tracer.Start(ctx, "streamcache.set")
		span.SetAttributes(attribute.String("cache.name", traceCacheName))
		if payload, err := json.Marshal(streams.Values()); err == nil {
			if err := l.cache.Set(ctx, l.listKey, string(payload), l.listTTL); err != nil {
				span.SetStatus(codes.Error, "cache set failed")
			}
		} else {
			span.SetStatus(codes.Error, "cache payload encode failed")
		}
		span.End()
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
