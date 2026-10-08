package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlapp"
)

func TestControlPolicyAdapterRejectsCrossGroupDecision(t *testing.T) {
	group := "co-b"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"allowed":true,"groupId":"` + group + `"}`))
	}))
	t.Cleanup(server.Close)
	adapter := controlPolicyAdapter{client: authpolicy.NewClient(server.URL, server.Client()), now: time.Now}
	target := controlapp.ControlPolicyTarget{Action: "command", DeviceID: "device-01", GroupID: "co-a", Command: "STOP"}

	if allowed, err := adapter.AuthorizeControl(context.Background(), "Bearer token", target); err != nil || allowed {
		t.Fatalf("cross-group decision allowed=%v err=%v", allowed, err)
	}
	group = "co-a"
	if allowed, err := adapter.AuthorizeControl(context.Background(), "Bearer token", target); err != nil || !allowed {
		t.Fatalf("same-group decision allowed=%v err=%v", allowed, err)
	}
}
