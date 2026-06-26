package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	metricNamespace        = "gcs"
	metricSubsystem        = "media_control"
	metricResultHit        = "hit"
	metricResultMiss       = "miss"
	metricResultDegraded   = "degraded"
	metricResultSuccess    = "success"
	metricResultError      = "error"
	metricSourceHTTP       = "http"
	metricSourceStream     = "stream_registry"
	metricSourceIceServers = "ice_servers"
)

type Metrics struct {
	registry               *prometheus.Registry
	httpRequests           *prometheus.CounterVec
	httpRequestDuration    *prometheus.HistogramVec
	streamRegistryRequests *prometheus.CounterVec
	streamRegistryDuration *prometheus.HistogramVec
	iceServerRequests      *prometheus.CounterVec
	iceServersReturned     prometheus.Histogram
	streamCacheEvents      *prometheus.CounterVec
	iceCacheEvents         *prometheus.CounterVec
	errors                 *prometheus.CounterVec
}

func NewMetrics() *Metrics {
	registry := prometheus.NewRegistry()
	metrics := &Metrics{
		registry: registry,
		httpRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "http_requests_total",
			Help:      "Total media-control HTTP requests by stable route, method, and status.",
		}, []string{"route", "method", "status"}),
		httpRequestDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "http_request_duration_seconds",
			Help:      "Media-control HTTP request duration by stable route, method, and status.",
			Buckets:   []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5},
		}, []string{"route", "method", "status"}),
		streamRegistryRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "stream_registry_requests_total",
			Help:      "Total stream registry requests to upstream MediaMTX path by result.",
		}, []string{"result"}),
		streamRegistryDuration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "stream_registry_duration_seconds",
			Help:      "Stream registry request duration by result.",
			Buckets:   []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5},
		}, []string{"result"}),
		iceServerRequests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "ice_server_requests_total",
			Help:      "Total ICE server list requests by result.",
		}, []string{"result"}),
		iceServersReturned: prometheus.NewHistogram(prometheus.HistogramOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "ice_servers_returned",
			Help:      "Number of healthy ICE servers returned per request.",
			Buckets:   []float64{0, 1, 2, 3, 5, 8},
		}),
		streamCacheEvents: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "stream_cache_events_total",
			Help:      "Stream list cache events by result.",
		}, []string{"result"}),
		iceCacheEvents: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "ice_cache_events_total",
			Help:      "ICE server cache events by result.",
		}, []string{"result"}),
		errors: prometheus.NewCounterVec(prometheus.CounterOpts{
			Namespace: metricNamespace,
			Subsystem: metricSubsystem,
			Name:      "errors_total",
			Help:      "Media-control errors by source and low-cardinality reason.",
		}, []string{"source", "reason"}),
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
	)
	return metrics
}

func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

func (m *Metrics) ObserveHTTP(route string, method string, status int, elapsed time.Duration) {
	statusLabel := strconv.Itoa(status)
	m.httpRequests.WithLabelValues(route, method, statusLabel).Inc()
	m.httpRequestDuration.WithLabelValues(route, method, statusLabel).Observe(elapsed.Seconds())
}

func (m *Metrics) ObserveStreamRegistry(err error, elapsed time.Duration) {
	result := metricResultSuccess
	if err != nil {
		result = metricResultError
		m.ObserveError(metricSourceStream, metricResultError)
	}
	m.streamRegistryRequests.WithLabelValues(result).Inc()
	m.streamRegistryDuration.WithLabelValues(result).Observe(elapsed.Seconds())
}

func (m *Metrics) ObserveIceServers(count int) {
	result := metricResultSuccess
	if count == 0 {
		result = metricResultError
		m.ObserveError(metricSourceIceServers, metricResultError)
	}
	m.iceServerRequests.WithLabelValues(result).Inc()
	m.iceServersReturned.Observe(float64(count))
}

func (m *Metrics) ObserveStreamCache(result string) {
	m.streamCacheEvents.WithLabelValues(cacheMetricResult(result)).Inc()
}

func (m *Metrics) ObserveIceCache(result string) {
	m.iceCacheEvents.WithLabelValues(cacheMetricResult(result)).Inc()
}

func (m *Metrics) ObserveError(source string, reason string) {
	m.errors.WithLabelValues(source, reason).Inc()
}

func cacheMetricResult(result string) string {
	switch result {
	case metricResultHit, metricResultMiss, metricResultDegraded:
		return result
	default:
		return metricResultError
	}
}
