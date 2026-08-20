package sessionstore

import (
	"fmt"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestDecodeRejectsCorruptTimestampAndStatus(t *testing.T) {
	now := time.Now().UTC()
	values := encode(domain.PublishSession{
		SessionID: "session", DeviceUUID: "device", SensorID: "front", StreamID: "opaque", Path: "private",
		GroupID: "group", Status: domain.PublishSessionActive, RenewalTokenHash: []byte("hash"),
		PublishTokenExpiresAt: now.Add(time.Minute), RenewalTokenExpiresAt: now.Add(time.Hour),
		CreatedAt: now, UpdatedAt: now,
	})
	encoded := make(map[string]string, len(values))
	for key, value := range values {
		encoded[key] = toRedisString(value)
	}

	encoded["publish_expires_ms"] = "not-a-timestamp"
	if _, err := decode(encoded); err == nil {
		t.Fatal("corrupt timestamp must fail decoding")
	}
	encoded["publish_expires_ms"] = toRedisString(values["publish_expires_ms"])
	encoded["status"] = "unknown"
	if _, err := decode(encoded); err == nil {
		t.Fatal("unknown status must fail decoding")
	}
}

func toRedisString(value any) string {
	return fmt.Sprint(value)
}
