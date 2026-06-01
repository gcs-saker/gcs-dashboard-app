package streamcache

import (
	"context"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type recordingLister struct {
	calls   int
	streams []domain.StreamDescriptor
	err     error
}

func (l *recordingLister) ListStreams(context.Context) ([]domain.StreamDescriptor, error) {
	l.calls++
	return l.streams, l.err
}

type memoryStringCache struct {
	values map[string]string
}

func newMemoryStringCache() *memoryStringCache {
	return &memoryStringCache{values: map[string]string{}}
}

func (c *memoryStringCache) Get(_ context.Context, key string) (string, bool, error) {
	value, ok := c.values[key]
	return value, ok, nil
}

func (c *memoryStringCache) Set(_ context.Context, key string, value string, _ time.Duration) error {
	c.values[key] = value
	return nil
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

	if upstream.calls != 1 {
		t.Fatalf("expected one upstream call, got %d", upstream.calls)
	}
	if len(first) != 1 || len(second) != 1 {
		t.Fatalf("expected cached streams, got first=%d second=%d", len(first), len(second))
	}
	if cache.values["presence:raw/local/webcam"] != "online" {
		t.Fatalf("expected online presence key, got %q", cache.values["presence:raw/local/webcam"])
	}
}
