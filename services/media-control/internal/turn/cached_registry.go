package turn

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
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
)

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
	cached, ok, err := p.cache.Get(ctx, p.key)
	if err != nil || !ok {
		if err != nil {
			p.observe(CacheResultDegraded)
		} else {
			p.observe(CacheResultMiss)
		}
		return nil, false
	}
	var servers []domain.IceServer
	if json.Unmarshal([]byte(cached), &servers) != nil {
		p.observe(CacheResultDegraded)
		return nil, false
	}
	p.observe(CacheResultHit)
	return domain.NewIceServerList(servers).Healthy().Values(), true
}

func (p CachedIceServerProvider) store(ctx context.Context, servers []domain.IceServer) {
	if p.cache == nil || p.ttl <= 0 || p.key == "" {
		return
	}
	payload, err := json.Marshal(domain.NewIceServerList(servers).Healthy().Values())
	if err != nil {
		return
	}
	_ = p.cache.Set(ctx, p.key, string(payload), p.ttl)
}

func (p CachedIceServerProvider) observe(result string) {
	if p.observer != nil {
		p.observer.ObserveIceCache(result)
	}
}
