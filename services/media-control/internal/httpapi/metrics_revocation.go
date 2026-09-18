package httpapi

import "github.com/prometheus/client_golang/prometheus"

func newRevocationScansMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "session_revocation_scans_total", Help: "WebRTC session revocation scans by result.",
	}, []string{"result"})
}

func newRevocationScanDurationMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "session_revocation_scan_duration_seconds", Help: "WebRTC revocation scan latency by result.",
		Buckets: requestDurationBuckets,
	}, []string{"result"})
}

func newRevocationActiveMetric() prometheus.Gauge {
	return prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "session_revocation_active_sessions", Help: "WebRTC sessions inspected in the latest revocation scan.",
	})
}

func newRevocationOutcomesMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "session_revocation_outcomes_total", Help: "WebRTC session revocation decisions by kind and result.",
	}, []string{"kind", "result"})
}

func newRevocationLatencyMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "session_revocation_latency_seconds", Help: "Per-session revocation decision latency by result.",
		Buckets: requestDurationBuckets,
	}, []string{"result"})
}
