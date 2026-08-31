package httpapi

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestMetricsEndpointExposesPrometheusText(t *testing.T) {
	metrics := NewMetrics()
	metrics.ObserveStreamCache(metricResultHit)
	metrics.ObserveIceCache(metricResultMiss)
	metrics.ObserveError(metricSourceHTTP, "access_denied")
	metrics.ObserveGateway("GATEWAY_ACK_STATUS_ACCEPTED", "accepted", 3*time.Millisecond)
	recorder := httptest.NewRecorder()

	metrics.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	body := recorder.Body.String()
	for _, expected := range []string{
		"gcs_media_control_stream_cache_events_total{result=\"hit\"} 1",
		"gcs_media_control_ice_cache_events_total{result=\"miss\"} 1",
		"gcs_media_control_errors_total{reason=\"access_denied\",source=\"http\"} 1",
		"gcs_media_control_gateway_messages_total{reason=\"accepted\",status=\"GATEWAY_ACK_STATUS_ACCEPTED\"} 1",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected metric line %q in:\n%s", expected, body)
		}
	}
}

func TestMetricsIncreaseAfterStreamAndIceRequests(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("stun:turn-primary:3478", domain.IceServerSTUN, "", "", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	)

	for _, route := range []string{"/api/v1/streams", "/api/v1/streams/ice-servers"} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, route, nil)
		server.Routes().ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("expected %s 200, got %d: %s", route, recorder.Code, recorder.Body.String())
		}
	}

	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := recorder.Body.String()
	for _, expected := range []string{
		"gcs_media_control_http_requests_total{method=\"GET\",route=\"/api/v1/streams\",status=\"200\"} 1",
		"gcs_media_control_http_requests_total{method=\"GET\",route=\"/api/v1/streams/ice-servers\",status=\"200\"} 1",
		"gcs_media_control_stream_registry_requests_total{result=\"success\"} 1",
		"gcs_media_control_ice_server_requests_total{result=\"success\"} 1",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected metric line %q in:\n%s", expected, body)
		}
	}
}

func TestMetricsClassifiesUnknownCacheResultAsError(t *testing.T) {
	metrics := NewMetrics()
	metrics.ObserveStreamCache("stream-id-must-not-be-a-label")
	metrics.ObserveHTTP("/api/v1/streams/{streamId}", http.MethodGet, http.StatusNotFound, 2*time.Millisecond)
	recorder := httptest.NewRecorder()

	metrics.Handler().ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := recorder.Body.String()
	for _, expected := range []string{
		"gcs_media_control_stream_cache_events_total{result=\"error\"} 1",
		"gcs_media_control_http_requests_total{method=\"GET\",route=\"/api/v1/streams/{streamId}\",status=\"404\"} 1",
	} {
		if !strings.Contains(body, expected) {
			t.Fatalf("expected metric line %q in:\n%s", expected, body)
		}
	}
}

func TestPublicMetricsPathIsBlockedByEdgePolicy(t *testing.T) {
	configBody := readFileForTest(t, "../../../../deploy/nginx/gcs-saker.reverse-proxy.example.conf")
	if !strings.Contains(configBody, "location = /media-control/metrics") || !strings.Contains(configBody, "return 404;") {
		t.Fatalf("expected public /media-control/metrics to be blocked in edge config")
	}
}

func readFileForTest(t *testing.T, path string) string {
	t.Helper()
	payload, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("edge config is outside the media-control Docker build context: %s", path)
		}
		t.Fatal(err)
	}
	return string(payload)
}
