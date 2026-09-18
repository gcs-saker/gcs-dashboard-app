package sessionstore

import (
	"strconv"
	"testing"
	"time"
)

func TestClassifyStatisticsSeparatesActiveEndedAndExpired(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	stats := Statistics{}
	classifyStatistics(&stats, values("active", now.Add(time.Minute), now.Add(-time.Minute)), now)
	classifyStatistics(&stats, values("ended", now.Add(time.Minute), now.Add(-2*time.Minute)), now)
	classifyStatistics(&stats, values("active", now.Add(-time.Second), now.Add(-3*time.Minute)), now)

	if stats.Active != 1 || stats.Ended != 1 || stats.Expired != 1 || stats.OldestAge != 3*time.Minute {
		t.Fatalf("unexpected statistics %#v", stats)
	}
}

func values(status string, expires time.Time, created time.Time) map[string]string {
	return map[string]string{
		"status":             status,
		"renewal_expires_ms": strconv.FormatInt(expires.UnixMilli(), 10),
		"created_ms":         strconv.FormatInt(created.UnixMilli(), 10),
	}
}
