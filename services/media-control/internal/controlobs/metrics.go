package controlobs

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

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
