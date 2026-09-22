package controlsession

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/redis/go-redis/v9"
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

func TestRedisLeaseUsesAtomicHashedExpiryBoundReservation(t *testing.T) {
	now := time.Now()
	stub := &leaseSetNXStub{result: true}
	acquired, err := (&RedisLeaseStore{client: stub}).Acquire(context.Background(), "device-01", "control-01", now.Add(20*time.Second), now)
	if err != nil || !acquired || stub.ttl != 20*time.Second {
		t.Fatalf("unexpected lease result acquired=%v ttl=%s err=%v", acquired, stub.ttl, err)
	}
	if strings.Contains(stub.key, "device-01") || !strings.HasPrefix(stub.key, leaseKeyPrefix) {
		t.Fatalf("device identity must be hashed in the Redis key: %s", stub.key)
	}
}

func session(now time.Time) domain.PublishSession {
	return domain.PublishSession{SessionID: "session-01", DeviceUUID: "device-01", GroupID: "co-a",
		Status: domain.PublishSessionActive, RenewalTokenExpiresAt: now.Add(30 * time.Second)}
}

type leaseSetNXStub struct {
	result bool
	key    string
	ttl    time.Duration
}

func (s *leaseSetNXStub) SetNX(_ context.Context, key string, _ any, ttl time.Duration) *redis.BoolCmd {
	s.key, s.ttl = key, ttl
	return redis.NewBoolResult(s.result, nil)
}
