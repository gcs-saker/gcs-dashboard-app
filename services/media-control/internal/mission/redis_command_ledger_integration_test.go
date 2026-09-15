package mission

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestRedisCommandLedgerIntegrationRejectsSecondReservation(t *testing.T) {
	address := os.Getenv("TEST_REDIS_ADDR")
	if address == "" {
		t.Skip("TEST_REDIS_ADDR is not configured")
	}
	client := redis.NewClient(&redis.Options{
		Addr: address, Password: os.Getenv("TEST_REDIS_PASSWORD"),
		DialTimeout: 2 * time.Second, ReadTimeout: 2 * time.Second, WriteTimeout: 2 * time.Second,
	})
	t.Cleanup(func() { _ = client.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("redis is unavailable: %v", err)
	}
	commandID := "qualification-command-" + time.Now().UTC().Format("20060102150405.000000000")
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cleanupCancel()
		_ = client.Del(cleanupCtx, commandLedgerKey(commandID)).Err()
	})
	ledger := NewRedisCommandLedger(client, time.Now)

	first, firstErr := ledger.Reserve(ctx, commandID, time.Now().Add(time.Minute))
	second, secondErr := ledger.Reserve(ctx, commandID, time.Now().Add(time.Minute))

	if firstErr != nil || secondErr != nil || !first || second {
		t.Fatalf("expected one atomic reservation, got first=%v second=%v errors=%v/%v", first, second, firstErr, secondErr)
	}
}
