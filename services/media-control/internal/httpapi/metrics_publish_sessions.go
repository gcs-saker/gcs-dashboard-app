package httpapi

import "github.com/prometheus/client_golang/prometheus"

func newPublishSessionCountMetric() *prometheus.GaugeVec {
	return prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "publish_sessions", Help: "Bounded Redis publish sessions by lifecycle state.",
	}, []string{"state"})
}

func newPublishSessionOldestMetric() prometheus.Gauge {
	return prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "publish_session_oldest_age_seconds", Help: "Age of the oldest bounded Redis publish session.",
	})
}

func newPublishSessionScansMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "publish_session_statistics_total", Help: "Bounded Redis publish-session statistics scans by result.",
	}, []string{"result"})
}
