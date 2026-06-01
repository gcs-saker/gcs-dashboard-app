package authpolicy

import (
	"context"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type countingAuthorizer struct {
	calls int
}

func (a *countingAuthorizer) AuthorizeStream(
	_ context.Context,
	_ string,
	target domain.StreamAccessTarget,
) (domain.StreamAccessDecision, error) {
	a.calls++
	return domain.AllowStream(target.StreamID, "same group stream"), nil
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
