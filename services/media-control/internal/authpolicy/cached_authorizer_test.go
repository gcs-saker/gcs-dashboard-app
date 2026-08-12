package authpolicy

import (
	"context"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type countingAuthorizer struct {
	calls     int
	expiresAt *time.Time
}

func (a *countingAuthorizer) AuthorizeStream(
	_ context.Context,
	_ string,
	target domain.StreamAccessTarget,
) (domain.StreamAccessDecision, error) {
	a.calls++
	decision := domain.AllowStream(target.StreamID, "same group stream")
	decision.ExpiresAt = a.expiresAt
	return decision, nil
}

func TestCachedAuthorizerReusesFreshDecision(t *testing.T) {
	next := &countingAuthorizer{}
	cached := NewCachedAuthorizer(next, time.Minute)
	target := domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"}

	for i := 0; i < 3; i++ {
		decision, err := cached.AuthorizeStream(context.Background(), "Bearer token", target)
		if err != nil {
			t.Fatal(err)
		}
		if !decision.Allowed {
			t.Fatal("expected allowed decision")
		}
	}

	if next.calls != 1 {
		t.Fatalf("expected one upstream authorization call, got %d", next.calls)
	}
}

func TestCachedAuthorizerSeparatesStreams(t *testing.T) {
	next := &countingAuthorizer{}
	cached := NewCachedAuthorizer(next, time.Minute)

	_, _ = cached.AuthorizeStream(
		context.Background(),
		"Bearer token",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)
	_, _ = cached.AuthorizeStream(
		context.Background(),
		"Bearer token",
		domain.StreamAccessTarget{StreamID: "raw.local.webcam", Path: "raw/local/webcam", PublisherGroupID: "co-a"},
	)

	if next.calls != 2 {
		t.Fatalf("expected cache to keep stream access decisions separate, got %d calls", next.calls)
	}
}

func TestCachedAuthorizerHonorsDecisionExpiresAt(t *testing.T) {
	now := time.Date(2026, 6, 25, 12, 0, 0, 0, time.UTC)
	expiresAt := now.Add(100 * time.Millisecond)
	next := &countingAuthorizer{expiresAt: &expiresAt}
	cached := NewCachedAuthorizer(next, time.Minute)
	cached.now = func() time.Time { return now }
	target := domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"}

	_, _ = cached.AuthorizeStream(context.Background(), "Bearer token", target)
	cached.now = func() time.Time { return now.Add(150 * time.Millisecond) }
	_, _ = cached.AuthorizeStream(context.Background(), "Bearer token", target)

	if next.calls != 2 {
		t.Fatalf("expected decision expiry to invalidate cache, got %d calls", next.calls)
	}
}

func TestCachedAuthorizerBoundsDistinctAuthorizationEntries(t *testing.T) {
	next := &countingAuthorizer{}
	cached := NewCachedAuthorizer(next, time.Minute)
	cached.maxEntries = 2
	streamTarget := domain.StreamAccessTarget{StreamID: "raw.test", Path: "raw/test", PublisherGroupID: "co-a"}

	for _, authorization := range []string{"Bearer one", "Bearer two", "Bearer three"} {
		if _, err := cached.AuthorizeStream(context.Background(), authorization, streamTarget); err != nil {
			t.Fatalf("authorize stream: %v", err)
		}
	}

	if got := len(cached.entries); got != 2 {
		t.Fatalf("expected bounded cache size 2, got %d", got)
	}
}
