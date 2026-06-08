package turn

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type recordingIceServerProvider struct {
	mu      sync.Mutex
	calls   int
	servers []domain.IceServer
}

func (p *recordingIceServerProvider) HealthyIceServers() []domain.IceServer {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.calls++
	return p.servers
}

func (p *recordingIceServerProvider) callCount() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.calls
}

type memoryStringCache struct {
	mu     sync.Mutex
	values map[string]string
}

func newMemoryStringCache() *memoryStringCache {
	return &memoryStringCache{values: map[string]string{}}
}

func (c *memoryStringCache) Get(_ context.Context, key string) (string, bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	value, ok := c.values[key]
	return value, ok, nil
}

func (c *memoryStringCache) Set(_ context.Context, key string, value string, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.values[key] = value
	return nil
}

type failingStringCache struct{}

func (failingStringCache) Get(context.Context, string) (string, bool, error) {
	return "", false, errors.New("redis unavailable")
}

func (failingStringCache) Set(context.Context, string, string, time.Duration) error {
	return errors.New("redis unavailable")
}

func TestCachedIceServerProviderUsesRedisBackedServerListCache(t *testing.T) {
	stun, _ := domain.NewIceServer("stun:primary", domain.IceServerSTUN, "", "", true)
	turnServer, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "user", "pass", true)
	upstream := &recordingIceServerProvider{servers: []domain.IceServer{stun, turnServer}}
	cache := newMemoryStringCache()
	provider := NewCachedIceServerProvider(upstream, cache, "ice:servers", time.Second)

	first := provider.HealthyIceServers()
	second := provider.HealthyIceServers()

	if upstream.callCount() != 1 {
		t.Fatalf("expected one upstream call, got %d", upstream.callCount())
	}
	if len(first) != 2 || len(second) != 2 {
		t.Fatalf("expected cached STUN and TURN servers, got first=%d second=%d", len(first), len(second))
	}
}

func TestCachedIceServerProviderCoalescesConcurrentCacheMisses(t *testing.T) {
	turnServer, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "user", "pass", true)
	upstream := &recordingIceServerProvider{servers: []domain.IceServer{turnServer}}
	provider := NewCachedIceServerProvider(upstream, newMemoryStringCache(), "ice:servers", time.Second)
	var waitGroup sync.WaitGroup

	for range 8 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			if servers := provider.HealthyIceServers(); len(servers) != 1 {
				t.Errorf("expected one ICE server, got %d", len(servers))
			}
		}()
	}
	waitGroup.Wait()

	if upstream.callCount() != 1 {
		t.Fatalf("expected concurrent cache miss to hit upstream once, got %d", upstream.callCount())
	}
}

func TestCachedIceServerProviderTreatsRedisOutageAsDegradedCacheOnly(t *testing.T) {
	turnServer, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "user", "pass", true)
	upstream := &recordingIceServerProvider{servers: []domain.IceServer{turnServer}}
	provider := NewCachedIceServerProvider(upstream, failingStringCache{}, "ice:servers", time.Second)

	servers := provider.HealthyIceServers()

	if len(servers) != 1 {
		t.Fatalf("expected upstream ICE server during redis outage, got %d", len(servers))
	}
	if upstream.callCount() != 1 {
		t.Fatalf("expected one upstream call, got %d", upstream.callCount())
	}
}
