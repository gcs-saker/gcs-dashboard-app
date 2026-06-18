package streamcache

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type recordingLister struct {
	mu      sync.Mutex
	calls   int
	streams []domain.StreamDescriptor
	err     error
}

type failingStringCache struct{}

func (failingStringCache) Get(context.Context, string) (string, bool, error) {
	return "", false, errors.New("redis unavailable")
}

func (failingStringCache) Set(context.Context, string, string, time.Duration) error {
	return errors.New("redis unavailable")
}

func (l *recordingLister) ListStreams(context.Context) ([]domain.StreamDescriptor, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.calls++
	return l.streams, l.err
}

func (l *recordingLister) callCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.calls
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

func (c *memoryStringCache) get(key string) string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.values[key]
}

func TestCachedStreamListerUsesRedisBackedListCache(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	upstream := &recordingLister{
		streams: []domain.StreamDescriptor{{
			Path:        path,
			Ready:       true,
			Status:      domain.StreamStatusOnline,
			ReaderCount: 1,
		}},
	}
	cache := newMemoryStringCache()
	lister := NewCachedStreamLister(upstream, cache, "streams:list", "presence:", time.Second, 5*time.Second)

	first, err := lister.ListStreams(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	second, err := lister.ListStreams(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if upstream.callCount() != 1 {
		t.Fatalf("expected one upstream call, got %d", upstream.callCount())
	}
	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("expected cached streams, got first=%d second=%d", len(first), len(second))
	}
	if cache.get("presence:raw/local/webcam") != "online" {
		t.Fatalf("expected online presence key, got %q", cache.get("presence:raw/local/webcam"))
	}
}

func TestCachedStreamListerStoresOfflinePresenceForDisconnectDetection(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	upstream := &recordingLister{
		streams: []domain.StreamDescriptor{{
			Path:   path,
			Ready:  false,
			Status: domain.StreamStatusOffline,
		}},
	}
	cache := newMemoryStringCache()
	lister := NewCachedStreamLister(upstream, cache, "streams:list", "presence:", time.Second, 5*time.Second)

	if _, err := lister.ListStreams(context.Background()); err != nil {
		t.Fatal(err)
	}

	if cache.get("presence:raw/local/webcam") != "offline" {
		t.Fatalf("expected offline presence key for disconnect detection, got %q", cache.get("presence:raw/local/webcam"))
	}
}

func TestCachedStreamListerCoalescesConcurrentCacheMisses(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	upstream := &recordingLister{
		streams: []domain.StreamDescriptor{{
			Path:   path,
			Ready:  true,
			Status: domain.StreamStatusOnline,
		}},
	}
	cache := newMemoryStringCache()
	lister := NewCachedStreamLister(upstream, cache, "streams:list", "presence:", time.Second, 5*time.Second)
	var waitGroup sync.WaitGroup

	for range 8 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			streams, err := lister.ListStreams(context.Background())
			if err != nil {
				t.Errorf("unexpected list error: %v", err)
			}
			if len(streams) != 1 {
				t.Errorf("expected one stream, got %d", len(streams))
			}
		}()
	}
	waitGroup.Wait()

	if upstream.callCount() != 1 {
		t.Fatalf("expected concurrent cache miss to hit upstream once, got %d", upstream.callCount())
	}
}

func TestCachedStreamListerTreatsRedisOutageAsDegradedCacheOnly(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	upstream := &recordingLister{
		streams: []domain.StreamDescriptor{{
			Path:   path,
			Ready:  true,
			Status: domain.StreamStatusOnline,
		}},
	}
	lister := NewCachedStreamLister(upstream, failingStringCache{}, "streams:list", "presence:", time.Second, 5*time.Second)

	streams, err := lister.ListStreams(context.Background())
	if err != nil {
		t.Fatalf("redis outage must not fail MediaMTX stream listing: %v", err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected upstream stream during redis outage, got %d", len(streams))
	}
	if upstream.callCount() != 1 {
		t.Fatalf("expected one upstream call, got %d", upstream.callCount())
	}
}
