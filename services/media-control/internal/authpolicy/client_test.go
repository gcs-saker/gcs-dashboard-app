package authpolicy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestClientAuthorizesStreamThroughAuthPolicy(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/policy/streams/access" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("missing authorization header")
		}
		_, _ = w.Write([]byte(`{"streamId":"raw.sample.front","allowed":true,"reason":"same group stream"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	decision, err := client.AuthorizeStream(
		context.Background(),
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !decision.Allowed || decision.Reason != "same group stream" {
		t.Fatalf("unexpected decision %#v", decision)
	}
}

func TestClientRequiresBearerToken(t *testing.T) {
	client := NewClient("http://auth-policy.test", nil)

	_, err := client.AuthorizeStream(
		context.Background(),
		"",
		domain.StreamAccessTarget{StreamID: "raw.sample.front", Path: "raw/sample/front", PublisherGroupID: "co-a"},
	)

	if err != domain.ErrStreamAuthenticationRequired {
		t.Fatalf("expected auth required, got %v", err)
	}
}

func TestClientReturnsAccessDeniedForDenyDecision(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"streamId":"raw.company-b.front","allowed":false,"reason":"outside group"}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	decision, err := client.AuthorizeStream(
		context.Background(),
		"Bearer test-token",
		domain.StreamAccessTarget{StreamID: "raw.company-b.front", Path: "raw/company-b/front", PublisherGroupID: "co-b"},
	)

	if err != domain.ErrStreamAccessDenied {
		t.Fatalf("expected access denied, got %v", err)
	}
	if decision.Allowed {
		t.Fatal("expected deny decision")
	}
}
