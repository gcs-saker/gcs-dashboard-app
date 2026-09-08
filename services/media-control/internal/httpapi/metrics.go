package httpapi

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
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
	gatewayMessages        *prometheus.CounterVec
	gatewayDuration        *prometheus.HistogramVec
}

func NewMetrics() *Metrics {
	_, metrics := newMetricsRegistry()
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

func (m *Metrics) ObserveGateway(status string, reason string, elapsed time.Duration) {
	m.gatewayMessages.WithLabelValues(status, reason).Inc()
	m.gatewayDuration.WithLabelValues(status).Observe(elapsed.Seconds())
}

func cacheMetricResult(result string) string {
	switch result {
	case metricResultHit, metricResultMiss, metricResultDegraded:
		return result
	default:
		return metricResultError
	}
}
