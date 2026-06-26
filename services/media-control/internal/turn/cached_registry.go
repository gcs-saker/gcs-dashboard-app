package turn

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

type IceServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type StringCache interface {
	Get(ctx context.Context, key string) (string, bool, error)
	Set(ctx context.Context, key string, value string, ttl time.Duration) error
}

type CacheObserver interface {
	ObserveIceCache(result string)
}

const (
	CacheResultHit      = "hit"
	CacheResultMiss     = "miss"
	CacheResultDegraded = "degraded"
	traceCacheName      = "ice_servers"
)

var tracer = otel.Tracer("gcs-saker/media-control/turn")

type CachedIceServerProvider struct {
	upstream  IceServerProvider
	cache     StringCache
	key       string
	ttl       time.Duration
	refreshMu *sync.Mutex
	observer  CacheObserver
}

func NewCachedIceServerProvider(
	upstream IceServerProvider,
	cache StringCache,
	key string,
	ttl time.Duration,
) CachedIceServerProvider {
	return NewCachedIceServerProviderWithObserver(upstream, cache, key, ttl, nil)
}

func NewCachedIceServerProviderWithObserver(
	upstream IceServerProvider,
	cache StringCache,
	key string,
	ttl time.Duration,
	observer CacheObserver,
) CachedIceServerProvider {
	return CachedIceServerProvider{
		upstream:  upstream,
		cache:     cache,
		key:       key,
		ttl:       ttl,
		refreshMu: &sync.Mutex{},
		observer:  observer,
	}
}

func (p CachedIceServerProvider) HealthyIceServers() []domain.IceServer {
	if servers, ok := p.loadCached(context.Background()); ok {
		return servers
	}
	p.refreshMu.Lock()
	defer p.refreshMu.Unlock()
	if servers, ok := p.loadCached(context.Background()); ok {
		return servers
	}

	servers := p.upstream.HealthyIceServers()
	p.store(context.Background(), servers)
	return domain.NewIceServerList(servers).Values()
}

func (p CachedIceServerProvider) loadCached(ctx context.Context) ([]domain.IceServer, bool) {
	if p.cache == nil || p.ttl <= 0 || p.key == "" {
		return nil, false
	}
	ctx, span := tracer.Start(ctx, "icecache.get")
	defer span.End()
	span.SetAttributes(attribute.String("cache.name", traceCacheName))
	cached, ok, err := p.cache.Get(ctx, p.key)
	if err != nil || !ok {
		if err != nil {
			span.SetStatus(codes.Error, "cache degraded")
			span.SetAttributes(attribute.String("cache.result", CacheResultDegraded))
			p.observe(CacheResultDegraded)
		} else {
			span.SetAttributes(attribute.String("cache.result", CacheResultMiss))
			p.observe(CacheResultMiss)
		}
		return nil, false
	}
	var servers []domain.IceServer
	if json.Unmarshal([]byte(cached), &servers) != nil {
		span.SetStatus(codes.Error, "cache payload decode failed")
		span.SetAttributes(attribute.String("cache.result", CacheResultDegraded))
		p.observe(CacheResultDegraded)
		return nil, false
	}
	span.SetAttributes(attribute.String("cache.result", CacheResultHit))
	p.observe(CacheResultHit)
	return domain.NewIceServerList(servers).Healthy().Values(), true
}

func (p CachedIceServerProvider) store(ctx context.Context, servers []domain.IceServer) {
	if p.cache == nil || p.ttl <= 0 || p.key == "" {
		return
	}
	ctx, span := tracer.Start(ctx, "icecache.set")
	span.SetAttributes(attribute.String("cache.name", traceCacheName))
	payload, err := json.Marshal(domain.NewIceServerList(servers).Healthy().Values())
	if err != nil {
		span.SetStatus(codes.Error, "cache payload encode failed")
		span.End()
		return
	}
	if err := p.cache.Set(ctx, p.key, string(payload), p.ttl); err != nil {
		span.SetStatus(codes.Error, "cache set failed")
	}
	span.End()
}

func (p CachedIceServerProvider) observe(result string) {
	if p.observer != nil {
		p.observer.ObserveIceCache(result)
	}
}
