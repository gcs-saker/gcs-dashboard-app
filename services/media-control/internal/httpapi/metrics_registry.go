package httpapi

import "github.com/prometheus/client_golang/prometheus"

func newMetricsRegistry() (*prometheus.Registry, *Metrics) {
	registry := prometheus.NewRegistry()
	metrics := &Metrics{
		registry:               registry,
		httpRequests:           newHTTPRequestsMetric(),
		httpRequestDuration:    newHTTPRequestDurationMetric(),
		streamRegistryRequests: newStreamRegistryRequestsMetric(),
		streamRegistryDuration: newStreamRegistryDurationMetric(),
		iceServerRequests:      newIceServerRequestsMetric(),
		iceServersReturned:     newIceServersReturnedMetric(),
		streamCacheEvents:      newStreamCacheEventsMetric(),
		iceCacheEvents:         newIceCacheEventsMetric(),
		errors:                 newErrorsMetric(),
		gatewayMessages:        newGatewayMessagesMetric(),
		gatewayDuration:        newGatewayDurationMetric(),
	}
	registry.MustRegister(
		metrics.httpRequests,
		metrics.httpRequestDuration,
		metrics.streamRegistryRequests,
		metrics.streamRegistryDuration,
		metrics.iceServerRequests,
		metrics.iceServersReturned,
		metrics.streamCacheEvents,
		metrics.iceCacheEvents,
		metrics.errors,
		metrics.gatewayMessages,
		metrics.gatewayDuration,
	)
	return registry, metrics
}

func newGatewayMessagesMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "gateway_messages_total", Help: "gRPC gateway messages by status and stable reason.",
	}, []string{"status", "reason"})
}

func newGatewayDurationMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace, Subsystem: metricSubsystem,
		Name: "gateway_message_duration_seconds", Help: "gRPC gateway message processing latency by status.",
		Buckets: requestDurationBuckets,
	}, []string{"status"})
}

func newHTTPRequestsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "http_requests_total",
		Help:      "Total media-control HTTP requests by stable route, method, and status.",
	}, []string{"route", "method", "status"})
}

func newHTTPRequestDurationMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "http_request_duration_seconds",
		Help:      "Media-control HTTP request duration by stable route, method, and status.",
		Buckets:   requestDurationBuckets,
	}, []string{"route", "method", "status"})
}

func newStreamRegistryRequestsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "stream_registry_requests_total",
		Help:      "Total stream registry requests to upstream MediaMTX path by result.",
	}, []string{"result"})
}

func newStreamRegistryDurationMetric() *prometheus.HistogramVec {
	return prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "stream_registry_duration_seconds",
		Help:      "Stream registry request duration by result.",
		Buckets:   requestDurationBuckets,
	}, []string{"result"})
}

func newIceServerRequestsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "ice_server_requests_total",
		Help:      "Total ICE server list requests by result.",
	}, []string{"result"})
}

func newIceServersReturnedMetric() prometheus.Histogram {
	return prometheus.NewHistogram(prometheus.HistogramOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "ice_servers_returned",
		Help:      "Number of healthy ICE servers returned per request.",
		Buckets:   iceServerCountBuckets,
	})
}

func newStreamCacheEventsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "stream_cache_events_total",
		Help:      "Stream list cache events by result.",
	}, []string{"result"})
}

func newIceCacheEventsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "ice_cache_events_total",
		Help:      "ICE server cache events by result.",
	}, []string{"result"})
}

func newErrorsMetric() *prometheus.CounterVec {
	return prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: metricNamespace,
		Subsystem: metricSubsystem,
		Name:      "errors_total",
		Help:      "Media-control errors by source and low-cardinality reason.",
	}, []string{"source", "reason"})
}
