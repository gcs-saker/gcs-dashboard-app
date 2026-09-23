package controlstate

import (
	"errors"
	"sync"
	"time"
)

const maxPendingAcknowledgements = 256

var ErrAckTrackerFull = errors.New("control_ack_tracker_full")

type AckTracker struct {
	mu      sync.Mutex
	pending map[string]time.Time
}

func NewAckTracker() *AckTracker { return &AckTracker{pending: make(map[string]time.Time)} }

func (t *AckTracker) Register(commandID string, deadline time.Time) error {
	t.mu.Lock()
	defer t.mu.Unlock()
	if commandID == "" || deadline.IsZero() || len(t.pending) >= maxPendingAcknowledgements {
		return ErrAckTrackerFull
	}
	t.pending[commandID] = deadline
	return nil
}

func (t *AckTracker) Resolve(commandID string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.pending[commandID]; !ok {
		return false
	}
	delete(t.pending, commandID)
	return true
}

func (t *AckTracker) Expire(now time.Time) int {
	t.mu.Lock()
	defer t.mu.Unlock()
	expired := 0
	for commandID, deadline := range t.pending {
		if deadline.After(now) {
			continue
		}
		delete(t.pending, commandID)
		expired++
	}
	return expired
}
