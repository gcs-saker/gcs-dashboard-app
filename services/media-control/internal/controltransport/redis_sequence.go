package controltransport

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/redis/go-redis/v9"
)

const sequenceKeyPrefix = "gcs-saker:control-sequence:v1:"

var acceptSequenceScript = redis.NewScript(`
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if tonumber(ARGV[1]) ~= current + 1 then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
return 1
`)

type RedisSequenceLedger struct {
	client redis.Scripter
	now    func() time.Time
}

func NewRedisSequenceLedger(client redis.Scripter, now func() time.Time) *RedisSequenceLedger {
	if now == nil {
		now = time.Now
	}
	return &RedisSequenceLedger{client: client, now: now}
}

func (s *RedisSequenceLedger) Accept(ctx context.Context, sessionID string, sequence uint64, expiresAt time.Time) (bool, error) {
	if s == nil || s.client == nil || sessionID == "" || sequence == 0 {
		return false, ErrCommandUnavailable
	}
	ttl := expiresAt.Sub(s.now())
	if ttl <= 0 || ttl > commandTimeout {
		return false, ErrCommandExpired
	}
	result, err := acceptSequenceScript.Run(ctx, s.client, []string{sequenceKey(sessionID)}, sequence, ttl.Milliseconds()).Int()
	if err != nil {
		return false, ErrCommandUnavailable
	}
	return result == 1, nil
}

func sequenceKey(sessionID string) string {
	digest := sha256.Sum256([]byte(sessionID))
	return sequenceKeyPrefix + hex.EncodeToString(digest[:])
}
