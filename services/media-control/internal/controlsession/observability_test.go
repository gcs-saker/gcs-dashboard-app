package controlsession

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

func TestControlMetricsUseOnlyBoundedLabels(t *testing.T) {
	registry := prometheus.NewRegistry()
	observer := NewObserver(registry)
	observer.Record("attacker-free-form", "device-uuid-secret", time.Millisecond)
	families, err := registry.Gather()
	if err != nil {
		t.Fatal(err)
	}
	wire, _ := json.Marshal(families)
	if strings.Contains(string(wire), "device-uuid-secret") || !strings.Contains(string(wire), "internal") {
		t.Fatalf("metrics leaked unbounded label: %s", wire)
	}
}

func TestAuditEventHasNoIdentityTokenOrRouteFields(t *testing.T) {
	event := AuditEvent{"control.command", "STOP", "applied", "none", "2026-09-23T00:00:00Z"}
	wire, _ := json.Marshal(event)
	for _, forbidden := range []string{"uuid", "token", "topic", "route", "session"} {
		if strings.Contains(strings.ToLower(string(wire)), forbidden) {
			t.Fatalf("audit event leaked %s: %s", forbidden, wire)
		}
	}
}

func TestAckTrackerResolvesAndExpiresBoundedEntries(t *testing.T) {
	now := time.Now()
	tracker := NewAckTracker()
	if err := tracker.Register("command-1", now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Register("command-2", now); err != nil {
		t.Fatal(err)
	}
	if !tracker.Resolve("command-1") || tracker.Resolve("unknown") {
		t.Fatal("unexpected resolve result")
	}
	if expired := tracker.Expire(now); expired != 1 {
		t.Fatalf("expected one timeout, got %d", expired)
	}
}
