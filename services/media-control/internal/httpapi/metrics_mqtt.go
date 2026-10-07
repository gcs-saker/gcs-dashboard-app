package httpapi

import "github.com/prometheus/client_golang/prometheus"

func newMQTTIngressMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "mqtt_ingress_total",
		Help:      "MQTT ingress messages by bounded processing result.",
	}, []string{"result"})
}

func newMQTTQueueDepthMetric() prometheus.Gauge {
	return prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "mqtt_queue_depth",
		Help:      "Messages waiting in MQTT ingress and partition queues.",
	})
}
