package controllease

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

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

type leaseSetNXStub struct {
	result bool
	key    string
	ttl    time.Duration
}

func (s *leaseSetNXStub) SetNX(_ context.Context, key string, _ any, ttl time.Duration) *redis.BoolCmd {
	s.key, s.ttl = key, ttl
	return redis.NewBoolResult(s.result, nil)
}
