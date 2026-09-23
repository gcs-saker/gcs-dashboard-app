package controllease

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"time"

	"github.com/redis/go-redis/v9"
)

const leaseKeyPrefix = "gcs-saker:control-lease:v1:"

var (
	ErrLeaseUnavailable = errors.New("control_lease_unavailable")
	ErrLeaseInvalid     = errors.New("control_lease_invalid")
)

var opaqueSegment = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

type setNXClient interface {
	SetNX(context.Context, string, any, time.Duration) *redis.BoolCmd
}

type RedisLeaseStore struct{ client setNXClient }

func NewRedisLeaseStore(client redis.Cmdable) *RedisLeaseStore {
	return &RedisLeaseStore{client: client}
}

func (s *RedisLeaseStore) Acquire(
	ctx context.Context,
	deviceID string,
	controlSessionID string,
	expiresAt time.Time,
	now time.Time,
) (bool, error) {
	if s == nil || s.client == nil {
		return false, ErrLeaseUnavailable
	}
	ttl := expiresAt.Sub(now)
	if !opaqueSegment.MatchString(deviceID) || !opaqueSegment.MatchString(controlSessionID) || ttl <= 0 || ttl > 30*time.Second {
		return false, ErrLeaseInvalid
	}
	acquired, err := s.client.SetNX(ctx, leaseKey(deviceID), controlSessionID, ttl).Result()
	if err != nil {
		return false, ErrLeaseUnavailable
	}
	return acquired, nil
}

func leaseKey(deviceID string) string {
	digest := sha256.Sum256([]byte(deviceID))
	return leaseKeyPrefix + hex.EncodeToString(digest[:])
}
