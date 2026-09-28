package controlstate

import (
	"fmt"
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

func TestAckTrackerEnforcesExactCapacityBoundary(t *testing.T) {
	tracker := NewAckTracker()
	deadline := time.Now().Add(time.Minute)
	for index := 0; index < maxPendingAcknowledgements; index++ {
		if err := tracker.Register(fmt.Sprintf("command-%d", index), deadline); err != nil {
			t.Fatalf("entry %d within capacity was rejected: %v", index, err)
		}
	}
	if err := tracker.Register("command-over-capacity", deadline); err != ErrAckTrackerFull {
		t.Fatalf("entry beyond capacity error=%v", err)
	}
	if !tracker.Resolve("command-0") {
		t.Fatal("capacity entry could not be resolved")
	}
	if err := tracker.Register("command-after-release", deadline); err != nil {
		t.Fatalf("released capacity was not reusable: %v", err)
	}
}
