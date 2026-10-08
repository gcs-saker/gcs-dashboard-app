package sessionstore

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/redis/go-redis/v9"
)

const defaultStatisticsLimit = 1000

type Statistics struct {
	Active, Ended, Expired, Scanned int
	OldestAge                       time.Duration
	Truncated                       bool
}

var statisticsScript = redis.NewScript(`
local expired = redis.call('ZRANGEBYSCORE', KEYS[3], '-inf', ARGV[1], 'LIMIT', 0, ARGV[2])
for _, id in ipairs(expired) do
  local status = redis.call('HGET', KEYS[1], id)
  if status then redis.call('HINCRBY', KEYS[2], status, -1) end
  redis.call('HDEL', KEYS[1], id)
  redis.call('ZREM', KEYS[3], id)
  redis.call('ZREM', KEYS[4], id)
end
local oldest = redis.call('ZRANGE', KEYS[4], 0, 0, 'WITHSCORES')
local oldestScore = oldest[2] or '0'
local remainingExpired = redis.call('ZCOUNT', KEYS[3], '-inf', ARGV[1])
return {
  tostring(redis.call('HGET', KEYS[2], 'active') or '0'),
  tostring(redis.call('HGET', KEYS[2], 'ended') or '0'),
  tostring(#expired), oldestScore,
  tostring(redis.call('ZCARD', KEYS[3])),
  tostring(remainingExpired > 0 and 1 or 0)
}
`)

func (s *RedisStore) SnapshotStatistics(ctx context.Context, now time.Time, limit int) (Statistics, error) {
	if limit <= 0 || limit > defaultStatisticsLimit {
		limit = defaultStatisticsLimit
	}
	values, err := statisticsScript.Run(ctx, s.client,
		[]string{statisticsStatusKey, statisticsCountKey, statisticsExpiryKey, statisticsCreatedKey},
		now.UnixMilli(), limit,
	).StringSlice()
	if err != nil || len(values) != 6 {
		return Statistics{}, fmt.Errorf("%w: aggregate statistics", domain.ErrPublishSessionStoreUnavailable)
	}
	return decodeStatistics(values, now), nil
}

func decodeStatistics(values []string, now time.Time) Statistics {
	active, _ := strconv.Atoi(values[0])
	ended, _ := strconv.Atoi(values[1])
	expired, _ := strconv.Atoi(values[2])
	oldestMillis, _ := strconv.ParseInt(values[3], 10, 64)
	total, _ := strconv.Atoi(values[4])
	truncated := values[5] == "1"
	oldestAge := time.Duration(0)
	if oldestMillis > 0 {
		oldestAge = now.Sub(time.UnixMilli(oldestMillis))
	}
	return Statistics{Active: active, Ended: ended, Expired: expired, Scanned: total, OldestAge: oldestAge, Truncated: truncated}
}
