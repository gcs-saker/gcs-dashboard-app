package controlstate

import (
	"testing"
	"time"
)

func TestAckTrackerResolvesAndExpiresBoundedEntries(t *testing.T) {
	now := time.Now()
	tracker := NewAckTracker()
	if err := tracker.Register("command-1", now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	if err := tracker.Register("command-2", now); err != nil {
		t.Fatal(err)
	}
	if !tracker.Resolve("command-1") || tracker.Resolve("unknown") {
		t.Fatal("unexpected resolve result")
	}
	if expired := tracker.Expire(now); expired != 1 {
		t.Fatalf("expected one timeout, got %d", expired)
	}
}
