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
	Active    int
	Ended     int
	Expired   int
	OldestAge time.Duration
	Scanned   int
	Truncated bool
}

func (s *RedisStore) SnapshotStatistics(ctx context.Context, now time.Time, limit int) (Statistics, error) {
	if limit <= 0 || limit > defaultStatisticsLimit {
		limit = defaultStatisticsLimit
	}
	keys, truncated, err := s.scanSessionKeys(ctx, limit)
	if err != nil {
		return Statistics{}, fmt.Errorf("%w: scan statistics: %v", domain.ErrPublishSessionStoreUnavailable, err)
	}
	commands, err := s.loadSessionStatistics(ctx, keys)
	if err != nil {
		return Statistics{}, fmt.Errorf("%w: load statistics: %v", domain.ErrPublishSessionStoreUnavailable, err)
	}
	stats := Statistics{Scanned: len(keys), Truncated: truncated}
	for _, command := range commands {
		classifyStatistics(&stats, command.Val(), now)
	}
	return stats, nil
}

func (s *RedisStore) scanSessionKeys(ctx context.Context, limit int) ([]string, bool, error) {
	keys := make([]string, 0, limit)
	var cursor uint64
	for {
		batch, next, err := s.client.Scan(ctx, cursor, keyPrefix+"*", 100).Result()
		if err != nil {
			return nil, false, err
		}
		remaining := limit - len(keys)
		if len(batch) > remaining {
			return append(keys, batch[:remaining]...), true, nil
		}
		keys = append(keys, batch...)
		cursor = next
		if cursor == 0 || len(keys) == limit {
			return keys, cursor != 0, nil
		}
	}
}

func (s *RedisStore) loadSessionStatistics(ctx context.Context, keys []string) ([]*redis.MapStringStringCmd, error) {
	commands := make([]*redis.MapStringStringCmd, 0, len(keys))
	_, err := s.client.Pipelined(ctx, func(pipe redis.Pipeliner) error {
		for _, key := range keys {
			commands = append(commands, pipe.HGetAll(ctx, key))
		}
		return nil
	})
	return commands, err
}

func classifyStatistics(stats *Statistics, values map[string]string, now time.Time) {
	expiry, _ := strconv.ParseInt(values["renewal_expires_ms"], 10, 64)
	created, _ := strconv.ParseInt(values["created_ms"], 10, 64)
	if expiry <= now.UnixMilli() {
		stats.Expired++
	} else if values["status"] == "active" {
		stats.Active++
	} else {
		stats.Ended++
	}
	age := now.Sub(time.UnixMilli(created))
	if created > 0 && age > stats.OldestAge {
		stats.OldestAge = age
	}
}
