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
	talkbackSnapshots      *prometheus.CounterVec
	talkbackSnapshotTime   *prometheus.HistogramVec
	talkbackTransitions    *prometheus.CounterVec
	revocationScans        *prometheus.CounterVec
	revocationScanDuration *prometheus.HistogramVec
	revocationActive       prometheus.Gauge
	revocationOutcomes     *prometheus.CounterVec
	revocationLatency      *prometheus.HistogramVec
	publishSessionCount    *prometheus.GaugeVec
	publishSessionOldest   prometheus.Gauge
	publishSessionScans    *prometheus.CounterVec
}

func (m *Metrics) ObservePublishSessionStatistics(active, ended, expired int, oldest time.Duration, truncated bool, err error) {
	result := metricResultSuccess
	if err != nil {
		result = metricResultError
		m.ObserveError("publish_session_store", "statistics_failed")
	}
	if truncated {
		result = "truncated"
	}
	m.publishSessionScans.WithLabelValues(result).Inc()
	if err != nil {
		return
	}
	m.publishSessionCount.WithLabelValues("active").Set(float64(active))
	m.publishSessionCount.WithLabelValues("ended").Set(float64(ended))
	m.publishSessionCount.WithLabelValues("expired").Set(float64(expired))
	m.publishSessionOldest.Set(oldest.Seconds())
}

func (m *Metrics) ObserveSessionRevocationScan(err error, elapsed time.Duration, active int) {
	result := metricResultSuccess
	if err != nil {
		result = metricResultError
		m.ObserveError(metricSourceRevocation, metricErrorSnapshotFailed)
	}
	m.revocationScans.WithLabelValues(result).Inc()
	m.revocationScanDuration.WithLabelValues(result).Observe(elapsed.Seconds())
	m.revocationActive.Set(float64(active))
}

func (m *Metrics) ObserveSessionRevocation(kind string, result string, elapsed time.Duration) {
	m.revocationOutcomes.WithLabelValues(revocationKind(kind), revocationResult(result)).Inc()
	m.revocationLatency.WithLabelValues(revocationResult(result)).Observe(elapsed.Seconds())
}

func revocationKind(kind string) string {
	if kind == "publish" || kind == "read" {
		return kind
	}
	return "unknown"
}

func revocationResult(result string) string {
	switch result {
	case "ignored", "retained", "revoked", "kick_failed", "audit_failed":
		return result
	default:
		return metricResultError
	}
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

func (m *Metrics) ObserveTalkbackSnapshot(err error, elapsed time.Duration) {
	result := metricResultSuccess
	if err != nil {
		result = metricResultError
		m.ObserveError(metricSourceTalkback, metricErrorSnapshotFailed)
	}
	m.talkbackSnapshots.WithLabelValues(result).Inc()
	m.talkbackSnapshotTime.WithLabelValues(result).Observe(elapsed.Seconds())
}

func (m *Metrics) ObserveTalkbackTransition(operation string, err error) {
	result := metricResultSuccess
	if err != nil {
		result = metricResultError
		m.ObserveError(metricSourceTalkback, metricErrorAuditFailed)
	}
	m.talkbackTransitions.WithLabelValues(talkbackOperation(operation), result).Inc()
}

func talkbackOperation(operation string) string {
	switch operation {
	case "talkback.session.started":
		return "started"
	case "talkback.session.disconnected":
		return "disconnected"
	default:
		return "unknown"
	}
}

func cacheMetricResult(result string) string {
	switch result {
	case metricResultHit, metricResultMiss, metricResultDegraded:
		return result
	default:
		return metricResultError
	}
}
