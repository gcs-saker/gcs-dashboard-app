package mission

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestRedisCommandLedgerAtomicallyReservesHashedKeyUntilExpiry(t *testing.T) {
	now := time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC)
	client := &setNXStub{result: true}
	ledger := newRedisCommandLedger(client, func() time.Time { return now })

	reserved, err := ledger.Reserve(context.Background(), "sensitive-command-id", now.Add(time.Minute))

	if err != nil || !reserved {
		t.Fatalf("expected reservation, got reserved=%v err=%v", reserved, err)
	}
	if client.key == "" || strings.Contains(client.key, "sensitive-command-id") || !strings.HasPrefix(client.key, commandLedgerKeyPrefix) {
		t.Fatalf("command identifier must be hashed in a versioned key: %q", client.key)
	}
	if client.ttl != time.Minute {
		t.Fatalf("expected expiry-bound TTL, got %s", client.ttl)
	}
}

func TestRedisCommandLedgerReportsDuplicateWithoutError(t *testing.T) {
	now := time.Now()
	ledger := newRedisCommandLedger(&setNXStub{result: false}, func() time.Time { return now })

	reserved, err := ledger.Reserve(context.Background(), "command", now.Add(time.Minute))

	if err != nil || reserved {
		t.Fatalf("expected duplicate result, got reserved=%v err=%v", reserved, err)
	}
}

func TestRedisCommandLedgerFailsClosedForExpiryAndStoreFailure(t *testing.T) {
	now := time.Now()
	expired := newRedisCommandLedger(&setNXStub{result: true}, func() time.Time { return now })
	if _, err := expired.Reserve(context.Background(), "command", now); !errors.Is(err, ErrCommandLedgerExpired) {
		t.Fatalf("expected typed expiry error, got %v", err)
	}
	failing := newRedisCommandLedger(&setNXStub{err: errors.New("private redis detail")}, func() time.Time { return now })
	if _, err := failing.Reserve(context.Background(), "command", now.Add(time.Minute)); !errors.Is(err, ErrCommandLedgerUnavailable) {
		t.Fatalf("expected sanitized unavailable error, got %v", err)
	}
}

func TestRedisCommandLedgerRejectsMissingIDAndExcessiveTTL(t *testing.T) {
	now := time.Now()
	ledger := newRedisCommandLedger(&setNXStub{result: true}, func() time.Time { return now })

	if _, err := ledger.Reserve(context.Background(), "", now.Add(time.Minute)); !errors.Is(err, ErrCommandLedgerInvalid) {
		t.Fatalf("expected empty ID rejection, got %v", err)
	}
	if _, err := ledger.Reserve(context.Background(), "command", now.Add(MaxCommandLifetime+time.Second)); !errors.Is(err, ErrCommandLedgerInvalid) {
		t.Fatalf("expected excessive TTL rejection, got %v", err)
	}
}

type setNXStub struct {
	result bool
	err    error
	key    string
	ttl    time.Duration
}

func (stub *setNXStub) SetNX(_ context.Context, key string, _ any, ttl time.Duration) *redis.BoolCmd {
	stub.key = key
	stub.ttl = ttl
	return redis.NewBoolResult(stub.result, stub.err)
}
