package mission

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const commandLedgerKeyPrefix = "gcs:mission-command:v1:"

var (
	ErrCommandLedgerUnavailable = errors.New("mission_command_ledger_unavailable")
	ErrCommandLedgerExpired     = errors.New("mission_command_ledger_expired")
	ErrCommandLedgerInvalid     = errors.New("mission_command_ledger_invalid")
)

type setNXClient interface {
	SetNX(context.Context, string, any, time.Duration) *redis.BoolCmd
}

type RedisCommandLedger struct {
	client setNXClient
	now    func() time.Time
}

func NewRedisCommandLedger(client redis.Cmdable, now func() time.Time) *RedisCommandLedger {
	return newRedisCommandLedger(client, now)
}

func newRedisCommandLedger(client setNXClient, now func() time.Time) *RedisCommandLedger {
	if now == nil {
		now = time.Now
	}
	return &RedisCommandLedger{client: client, now: now}
}

func (ledger *RedisCommandLedger) Reserve(ctx context.Context, commandID string, expiresAt time.Time) (bool, error) {
	if ledger == nil || ledger.client == nil {
		return false, ErrCommandLedgerUnavailable
	}
	ttl := expiresAt.Sub(ledger.now())
	if ttl <= 0 {
		return false, ErrCommandLedgerExpired
	}
	if commandID == "" || ttl > MaxCommandLifetime {
		return false, ErrCommandLedgerInvalid
	}
	reserved, err := ledger.client.SetNX(ctx, commandLedgerKey(commandID), "reserved", ttl).Result()
	if err != nil {
		return false, ErrCommandLedgerUnavailable
	}
	return reserved, nil
}

func commandLedgerKey(commandID string) string {
	digest := sha256.Sum256([]byte(commandID))
	return commandLedgerKeyPrefix + hex.EncodeToString(digest[:])
}
