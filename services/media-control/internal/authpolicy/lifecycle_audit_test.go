package authpolicy

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mediamtx"
)

func TestLifecycleAuditSinkUsesDedicatedServiceAuthentication(t *testing.T) {
	var token string
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token = r.Header.Get("X-GCS-Internal-Token")
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()
	sink, err := NewLifecycleAuditSink(server.URL, "audit-token-with-at-least-32-characters", server.Client())
	if err != nil {
		t.Fatal(err)
	}

	err = sink.RecordTalkbackLifecycle(context.Background(), mediamtx.TalkbackLifecycleEvent{
		Reference: "0123456789abcdef0123456789abcdef", GroupID: "co-a",
		Operation: "talkback.session.disconnected", OccurredAt: time.Unix(10, 0).UTC(),
	})

	if err != nil || token != "audit-token-with-at-least-32-characters" {
		t.Fatalf("expected authenticated audit request, got token=%q err=%v", token, err)
	}
	if payload["sessionReference"] != "0123456789abcdef0123456789abcdef" || payload["groupId"] != "co-a" {
		t.Fatalf("unexpected audit payload %#v", payload)
	}
}

func TestLifecycleAuditSinkRejectsWeakTokenAndNonSuccess(t *testing.T) {
	if _, err := NewLifecycleAuditSink("http://auth-policy", "short", nil); err == nil {
		t.Fatal("weak audit token accepted")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusUnauthorized) }))
	defer server.Close()
	sink, err := NewLifecycleAuditSink(server.URL, "audit-token-with-at-least-32-characters", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	if err := sink.RecordTalkbackLifecycle(context.Background(), mediamtx.TalkbackLifecycleEvent{}); err == nil {
		t.Fatal("non-success audit ingest response was ignored")
	}
}
