package sessionstore

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/redis/go-redis/v9"
)

const keyPrefix = "gcs-saker:publish-session:"

type RedisStore struct {
	client *redis.Client
}

func NewRedisStore(address, password string, timeout time.Duration) *RedisStore {
	return &RedisStore{client: redis.NewClient(&redis.Options{
		Addr: address, Password: password, DialTimeout: timeout,
		ReadTimeout: timeout, WriteTimeout: timeout,
	})}
}

func (s *RedisStore) Ping(ctx context.Context) error { return s.client.Ping(ctx).Err() }

func (s *RedisStore) Save(ctx context.Context, v domain.PublishSession) error {
	key := keyPrefix + v.SessionID
	err := s.client.HSet(ctx, key, encode(v)).Err()
	if err == nil {
		err = s.client.ExpireAt(ctx, key, v.RenewalTokenExpiresAt.Add(time.Minute)).Err()
	}
	return err
}

func (s *RedisStore) Find(ctx context.Context, id string) (domain.PublishSession, error) {
	values, err := s.client.HGetAll(ctx, keyPrefix+id).Result()
	if err != nil { return domain.PublishSession{}, fmt.Errorf("%w: %v", domain.ErrPublishSessionStoreUnavailable, err) }
	if len(values) == 0 {
		return domain.PublishSession{}, domain.ErrPublishSessionNotFound
	}
	v, err := decode(values)
	if err != nil { return domain.PublishSession{}, fmt.Errorf("%w: corrupt session", domain.ErrPublishSessionStoreUnavailable) }
	return v, nil
}

var rotateScript = redis.NewScript(`
local status = redis.call('HGET', KEYS[1], 'status')
if not status or status ~= 'active' then return {'rejected'} end
local expires = tonumber(redis.call('HGET', KEYS[1], 'renewal_expires_ms') or '0')
if expires <= tonumber(ARGV[5]) then return {'rejected'} end
local current = redis.call('HGET', KEYS[1], 'renewal_hash') or ''
local previous = redis.call('HGET', KEYS[1], 'previous_renewal_hash') or ''
if previous ~= '' and previous == ARGV[1] then
  redis.call('HSET', KEYS[1], 'status', 'ended', 'updated_ms', ARGV[5])
  return {'replayed'}
end
if current ~= ARGV[1] then return {'rejected'} end
local version = redis.call('HINCRBY', KEYS[1], 'renewal_version', 1)
redis.call('HSET', KEYS[1],
  'previous_renewal_hash', current,
  'renewal_hash', ARGV[2],
  'publish_expires_ms', ARGV[3],
  'renewal_expires_ms', ARGV[4],
  'updated_ms', ARGV[5])
redis.call('PEXPIREAT', KEYS[1], tonumber(ARGV[4]) + 60000)
return {'rotated', tostring(version)}
`)

func (s *RedisStore) RotateRenewal(ctx context.Context, id string, expected, next []byte, publishExpiry, renewalExpiry, now time.Time) (domain.PublishSession, domain.RenewalRotationResult, error) {
	result, err := rotateScript.Run(ctx, s.client, []string{keyPrefix + id},
		b64(expected), b64(next), millis(publishExpiry), millis(renewalExpiry), millis(now)).StringSlice()
	if err != nil || len(result) == 0 {
		return domain.PublishSession{}, domain.RenewalRejected, fmt.Errorf("%w: rotation failed", domain.ErrPublishSessionStoreUnavailable)
	}
	rotation := domain.RenewalRotationResult(result[0])
	v, findErr := s.Find(ctx, id)
	return v, rotation, findErr
}

func (s *RedisStore) End(ctx context.Context, id string, now time.Time) error {
	key := keyPrefix + id
	exists, err := s.client.Exists(ctx, key).Result()
	if err != nil || exists == 0 {
		if err != nil { return fmt.Errorf("%w: %v", domain.ErrPublishSessionStoreUnavailable, err) }
		return domain.ErrPublishSessionNotFound
	}
	if err := s.client.HSet(ctx, key, "status", string(domain.PublishSessionEnded), "updated_ms", millis(now)).Err(); err != nil {
		return fmt.Errorf("%w: %v", domain.ErrPublishSessionStoreUnavailable, err)
	}
	return nil
}

func encode(v domain.PublishSession) map[string]any {
	return map[string]any{
		"session_id": v.SessionID, "device_uuid": v.DeviceUUID, "sensor_id": v.SensorID,
		"stream_id": v.StreamID, "path": v.Path, "group_id": v.GroupID,
		"credential_version": v.CredentialVersion, "device_policy_version": v.DevicePolicyVersion,
		"status": string(v.Status), "renewal_hash": b64(v.RenewalTokenHash),
		"previous_renewal_hash": b64(v.PreviousRenewalTokenHash), "renewal_version": v.RenewalTokenVersion,
		"publish_expires_ms": millis(v.PublishTokenExpiresAt), "renewal_expires_ms": millis(v.RenewalTokenExpiresAt),
		"created_ms": millis(v.CreatedAt), "updated_ms": millis(v.UpdatedAt),
	}
}

func decode(m map[string]string) (domain.PublishSession, error) {
	credentialVersion, err := strconv.ParseInt(m["credential_version"], 10, 64)
	if err != nil {
		return domain.PublishSession{}, err
	}
	policyVersion, err := strconv.ParseInt(m["device_policy_version"], 10, 64)
	if err != nil {
		return domain.PublishSession{}, err
	}
	version, err := strconv.ParseInt(m["renewal_version"], 10, 64)
	if err != nil {
		return domain.PublishSession{}, err
	}
	current, err := base64.RawURLEncoding.DecodeString(m["renewal_hash"])
	if err != nil {
		return domain.PublishSession{}, err
	}
	previous, err := base64.RawURLEncoding.DecodeString(m["previous_renewal_hash"])
	if err != nil && m["previous_renewal_hash"] != "" {
		return domain.PublishSession{}, err
	}
	return domain.PublishSession{
		SessionID: m["session_id"], DeviceUUID: m["device_uuid"], SensorID: m["sensor_id"], StreamID: m["stream_id"], Path: m["path"], GroupID: m["group_id"],
		CredentialVersion: credentialVersion, DevicePolicyVersion: policyVersion, Status: domain.PublishSessionStatus(m["status"]),
		RenewalTokenHash: current, PreviousRenewalTokenHash: previous, RenewalTokenVersion: version,
		PublishTokenExpiresAt: fromMillis(m["publish_expires_ms"]), RenewalTokenExpiresAt: fromMillis(m["renewal_expires_ms"]),
		CreatedAt: fromMillis(m["created_ms"]), UpdatedAt: fromMillis(m["updated_ms"]),
	}, nil
}

func b64(v []byte) string           { return base64.RawURLEncoding.EncodeToString(v) }
func millis(v time.Time) int64      { return v.UnixMilli() }
func fromMillis(v string) time.Time { n, _ := strconv.ParseInt(v, 10, 64); return time.UnixMilli(n) }
