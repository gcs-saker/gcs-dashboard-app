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

type CachedIceServerProvider struct {
	upstream  IceServerProvider
	cache     StringCache
	key       string
	ttl       time.Duration
	refreshMu *sync.Mutex
}

func NewCachedIceServerProvider(
	upstream IceServerProvider,
	cache StringCache,
	key string,
	ttl time.Duration,
) CachedIceServerProvider {
	return CachedIceServerProvider{
		upstream:  upstream,
		cache:     cache,
		key:       key,
		ttl:       ttl,
		refreshMu: &sync.Mutex{},
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
		return nil, false
	}
	var servers []domain.IceServer
	if json.Unmarshal([]byte(cached), &servers) != nil {
		return nil, false
	}
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
