package sessionstore

import (
	"strconv"
	"testing"
	"time"
)

func TestDecodeStatisticsUsesAggregateCountersAndOldestIndex(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	oldest := now.Add(-3 * time.Minute).UnixMilli()
	stats := decodeStatistics([]string{"1005", "2", "3", strconv.FormatInt(oldest, 10), "1007", "0"}, now)

	if stats.Active != 1005 || stats.Ended != 2 || stats.Expired != 3 || stats.Scanned != 1007 || stats.Truncated {
		t.Fatalf("unexpected aggregate statistics %#v", stats)
	}
	if stats.OldestAge != 3*time.Minute {
		t.Fatalf("unexpected oldest age %s", stats.OldestAge)
	}
}
