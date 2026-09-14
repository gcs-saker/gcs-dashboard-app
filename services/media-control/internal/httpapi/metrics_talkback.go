package httpapi

import "github.com/prometheus/client_golang/prometheus"

func newTalkbackSnapshotsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "talkback_snapshot_total",
		Help:      "Talkback lifecycle snapshots by result.",
	}, []string{"result"})
}

func newTalkbackSnapshotDurationMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "talkback_snapshot_duration_seconds",
		Help:      "Talkback lifecycle snapshot latency by result.",
		Buckets:   requestDurationBuckets,
	}, []string{"result"})
}

func newTalkbackTransitionsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "talkback_transitions_total",
		Help:      "Talkback lifecycle transitions by operation and result.",
	}, []string{"operation", "result"})
}
