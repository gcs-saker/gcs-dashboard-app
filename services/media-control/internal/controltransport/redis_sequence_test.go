package controltransport

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestRedisSequenceLedgerRejectsReplayAndGap(t *testing.T) {
	address := os.Getenv("TEST_REDIS_ADDR")
	if address == "" {
		t.Skip("TEST_REDIS_ADDR is not configured")
	}
	client := redis.NewClient(&redis.Options{Addr: address, DialTimeout: 2 * time.Second})
	t.Cleanup(func() { _ = client.Close() })
	now := time.Now()
	sessionID := "control-sequence-" + now.UTC().Format("150405.000000000")
	t.Cleanup(func() { _ = client.Del(context.Background(), sequenceKey(sessionID)).Err() })
	ledger := NewRedisSequenceLedger(client, func() time.Time { return now })

	first, firstErr := ledger.Accept(context.Background(), sessionID, 1, now.Add(4*time.Second))
	replay, replayErr := ledger.Accept(context.Background(), sessionID, 1, now.Add(4*time.Second))
	gap, gapErr := ledger.Accept(context.Background(), sessionID, 3, now.Add(4*time.Second))
	second, secondErr := ledger.Accept(context.Background(), sessionID, 2, now.Add(4*time.Second))
	if firstErr != nil || replayErr != nil || gapErr != nil || secondErr != nil || !first || replay || gap || !second {
		t.Fatalf("unexpected sequence results first=%v replay=%v gap=%v second=%v", first, replay, gap, second)
	}
}
