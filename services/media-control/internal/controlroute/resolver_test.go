package controlroute

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestRouteResolverUsesServerOwnedActiveSession(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	_ = store.Save(context.Background(), session(now))
	route, err := NewRouteResolver(store).Resolve(context.Background(), RouteRequest{"device-01", "session-01", now})
	if err != nil || route.GroupID() != "co-a" || route.CommandTopic() != "gcs/device/session-01/command" {
		t.Fatalf("unexpected route: %+v err=%v", route, err)
	}
}

func TestInternalRouteCannotSerializePrivateRoutingData(t *testing.T) {
	wire, err := json.Marshal(InternalRoute{deviceID: "device-01", groupID: "co-a", commandTopic: "private-topic"})
	if err != nil || string(wire) != "{}" {
		t.Fatalf("private routing data must not serialize: %s err=%v", wire, err)
	}
}

func TestRouteResolverRejectsMismatchAndStaleSession(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	_ = store.Save(context.Background(), session(now))
	resolver := NewRouteResolver(store)
	if _, err := resolver.Resolve(context.Background(), RouteRequest{"device-02", "session-01", now}); !errors.Is(err, ErrDeviceMismatch) {
		t.Fatalf("expected mismatch, got %v", err)
	}
	if _, err := resolver.Resolve(context.Background(), RouteRequest{"device-01", "session-01", now.Add(time.Minute)}); !errors.Is(err, ErrSessionStale) {
		t.Fatalf("expected stale session, got %v", err)
	}
}

func session(now time.Time) domain.PublishSession {
	return domain.PublishSession{SessionID: "session-01", DeviceUUID: "device-01", GroupID: "co-a",
		Status: domain.PublishSessionActive, RenewalTokenExpiresAt: now.Add(30 * time.Second)}
}
