package main

import (
	"errors"
	"testing"
	"time"
)

func TestClassifyPublishSessionReadiness(t *testing.T) {
	tests := []struct {
		name      string
		oldest    time.Duration
		truncated bool
		err       error
		ready     bool
		reason    string
	}{
		{"healthy grace", 45 * time.Minute, false, nil, true, ""},
		{"store failure", 0, false, errors.New("redis"), false, "store_unavailable"},
		{"bounded scan exceeded", 0, true, nil, false, "scan_truncated"},
		{"stale session", 46*time.Minute + time.Second, false, nil, false, "session_age_exceeded"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ready, reason := classifyPublishSessionReadiness(test.oldest, test.truncated, test.err)
			if ready != test.ready || reason != test.reason {
				t.Fatalf("got ready=%v reason=%q", ready, reason)
			}
		})
	}
}

func TestPublishSessionReadinessReportsOnlyTransitions(t *testing.T) {
	state := &publishSessionReadiness{ready: true}
	changed, _ := state.update(false, "store_unavailable")
	if !changed {
		t.Fatal("degradation transition was not reported")
	}
	changed, _ = state.update(false, "store_unavailable")
	if changed {
		t.Fatal("unchanged degradation must not repeat alerts")
	}
	changed, previous := state.update(true, "")
	if !changed || previous != "store_unavailable" {
		t.Fatal("recovery transition lost its prior reason")
	}
}
