package streamcache

import (
	"context"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

func (l CachedStreamLister) loadCached(ctx context.Context) ([]domain.StreamDescriptor, bool) {
	if !l.listCacheEnabled() {
		return nil, false
	}
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
	if !ok {
		span.SetAttributes(attribute.String("cache.result", CacheResultMiss))
		l.observe(CacheResultMiss)
		return nil, false
	}
	streamList, err := decodeStreamList(cached)
	if err != nil {
		span.SetStatus(codes.Error, "cache payload decode failed")
		span.SetAttributes(attribute.String("cache.result", CacheResultDegraded))
		l.observe(CacheResultDegraded)
		return nil, false
	}
	span.SetAttributes(attribute.String("cache.result", CacheResultHit))
	l.observe(CacheResultHit)
	return streamList.Values(), true
}

func (l CachedStreamLister) store(ctx context.Context, streams domain.StreamList) {
	l.storeStreamList(ctx, streams)
	l.presence.Store(ctx, streams)
}

func (l CachedStreamLister) storeStreamList(ctx context.Context, streams domain.StreamList) {
	if !l.listCacheEnabled() {
		return
	}
	ctx, span := tracer.Start(ctx, "streamcache.set")
	defer span.End()
	span.SetAttributes(attribute.String("cache.name", traceCacheName))
	payload, err := encodeStreamList(streams)
	if err != nil {
		span.SetStatus(codes.Error, "cache payload encode failed")
		return
	}
	if err := l.cache.Set(ctx, l.listKey, payload, l.listTTL); err != nil {
		span.SetStatus(codes.Error, "cache set failed")
	}
}

func (l CachedStreamLister) listCacheEnabled() bool {
	return l.cache != nil && l.listTTL > 0 && l.listKey != ""
}
