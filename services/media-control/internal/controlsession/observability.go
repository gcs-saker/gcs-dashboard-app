package controlsession

import (
	"errors"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

const maxPendingAcknowledgements = 256

var ErrAckTrackerFull = errors.New("control_ack_tracker_full")

type AuditEvent struct {
	Operation string `json:"operation"`
	Command   string `json:"command"`
	Result    string `json:"result"`
	ErrorCode string `json:"errorCode"`
	Occurred  string `json:"occurredAt"`
}

type Observer struct {
	commands *prometheus.CounterVec
	latency  *prometheus.HistogramVec
}

func NewObserver(registerer prometheus.Registerer) *Observer {
	observer := &Observer{
		commands: prometheus.NewCounterVec(prometheus.CounterOpts{Name: "control_commands_total", Help: "Control command outcomes."}, []string{"result", "error_code"}),
		latency:  prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "control_command_duration_seconds", Help: "Control command completion latency."}, []string{"result"}),
	}
	registerer.MustRegister(observer.commands, observer.latency)
	return observer
}

func (o *Observer) Record(result, errorCode string, elapsed time.Duration) {
	result, errorCode = boundedResult(result), boundedErrorCode(errorCode)
	o.commands.WithLabelValues(result, errorCode).Inc()
	o.latency.WithLabelValues(result).Observe(elapsed.Seconds())
}

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

func boundedResult(value string) string {
	switch value {
	case "accepted", "applied", "rejected", "failed", "timeout":
		return value
	}
	return "failed"
}

func boundedErrorCode(value string) string {
	switch value {
	case "none", "unauthorized", "lease_mismatch", "sequence_rejected", "expired", "unsupported", "parameter_range", "device_unavailable", "internal":
		return value
	}
	return "internal"
}
