package httpapi

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

type fakeStreams struct {
	streams []domain.StreamDescriptor
	err     error
}

func (f fakeStreams) ListStreams(context.Context) ([]domain.StreamDescriptor, error) {
	return f.streams, f.err
}

type fakeIce struct {
	servers []domain.IceServer
}

func (f fakeIce) HealthyIceServers() []domain.IceServer {
	return f.servers
}

type fakeGatewayReadiness struct {
	ready  bool
	reason string
}

func (f fakeGatewayReadiness) Ready() (bool, string) {
	return f.ready, f.reason
}

type fakeAuthorizer struct {
	errByStream  map[string]error
	observedAuth *string
}

func (f fakeAuthorizer) AuthorizeStream(
	_ context.Context,
	authorization string,
	target domain.StreamAccessTarget,
) (domain.StreamAccessDecision, error) {
	if f.observedAuth != nil {
		*f.observedAuth = authorization
	}
	if err, ok := f.errByStream[target.StreamID]; ok {
		return domain.DenyStream(target.StreamID, err.Error()), err
	}
	return domain.AllowStream(target.StreamID, "test allow"), nil
}

type fakeDevicePublisher struct {
	authorization domain.DevicePublishAuthorization
	err           error
	observed      *domain.DevicePublishCommand
}

func (f fakeDevicePublisher) AuthorizeDevicePublish(
	_ context.Context,
	command domain.DevicePublishCommand,
) (domain.DevicePublishAuthorization, error) {
	if f.observed != nil {
		*f.observed = command
	}
	if f.err != nil {
		return domain.DevicePublishAuthorization{}, f.err
	}
	authorization := f.authorization
	if authorization.PublisherGroupID == "" {
		authorization.PublisherGroupID = "co-device"
	}
	if authorization.StreamID == "" {
		authorization.StreamID = command.StreamID
	}
	if authorization.Path == "" {
		authorization.Path = command.Path
	}
	if authorization.DeviceUUID == "" {
		authorization.DeviceUUID = command.DeviceUUID
	}
	return authorization, nil
}

func TestHealthz(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestHTTPHandlerExtractsTraceParentAndReturnsTraceID(t *testing.T) {
	otel.SetTextMapPropagator(propagation.TraceContext{})
	server := newTestServer(fakeStreams{}, fakeIce{})
	traceID := "4bf92f3577b34da6a3ce929d0e0e4736"
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.Header.Set("traceparent", "00-"+traceID+"-00f067aa0ba902b7-01")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if recorder.Header().Get("X-GCS-Trace-Id") != traceID {
		t.Fatalf("expected response trace id %s, got %q", traceID, recorder.Header().Get("X-GCS-Trace-Id"))
	}
}

func TestReadyzReturnsOKWhenMediaMTXAndIceServersAreReady(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	)
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[readinessResponse](t, recorder)
	if payload.Status != "ok" {
		t.Fatalf("expected ok readiness, got %#v", payload)
	}
}

func TestReadyzIncludesGrpcGatewayReadinessWhenConfigured(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	).WithGatewayReadiness(fakeGatewayReadiness{ready: true})
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[readinessResponse](t, recorder)
	assertReadyCheck(t, payload, "grpc_gateway", "ok", "")
}

func TestReadyzReturnsDegradedWhenGrpcGatewayFails(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	).WithGatewayReadiness(fakeGatewayReadiness{ready: false, reason: "serve_failed"})
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[readinessResponse](t, recorder)
	assertReadyCheck(t, payload, "grpc_gateway", "error", "serve_failed")
}

func TestReadyzDoesNotLeakRawGrpcGatewayErrorDetails(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	).WithGatewayReadiness(fakeGatewayReadiness{ready: false, reason: "listen_failed"})
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if strings.Contains(recorder.Body.String(), "bind") || strings.Contains(recorder.Body.String(), "address already in use") {
		t.Fatalf("readiness response leaked raw grpc bind detail: %s", recorder.Body.String())
	}
}

func TestReadyzReturnsDegradedWhenMediaMTXRegistryFails(t *testing.T) {
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(
		fakeStreams{err: errors.New("raw mediamtx connection refused")},
		fakeIce{servers: []domain.IceServer{ice}},
	)
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", recorder.Code)
	}
	payload := decodeTestJSON[readinessResponse](t, recorder)
	if payload.Status != "degraded" {
		t.Fatalf("expected degraded status, got %#v", payload)
	}
	assertReadyCheck(t, payload, "stream_registry", "error", "stream registry query failed")
	if strings.Contains(recorder.Body.String(), "connection refused") {
		t.Fatalf("readiness response leaked raw upstream detail: %s", recorder.Body.String())
	}
}

func TestReadyzReturnsDegradedWhenNoIceServersAreHealthy(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{},
	)
	request := httptest.NewRequest(http.MethodGet, "/readyz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", recorder.Code)
	}
	payload := decodeTestJSON[readinessResponse](t, recorder)
	assertReadyCheck(t, payload, "ice_servers", "error", "no healthy ICE servers available")
}

func TestRuntimeMetricsResponseExposesRuntimeSignals(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/metrics/runtime", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	payload := decodeTestJSON[runtimeResponse](t, recorder)
	if payload.Service != mediaControlServiceName {
		t.Fatalf("expected service %s, got %#v", mediaControlServiceName, payload)
	}
	if payload.Runtime.Goroutines <= 0 {
		t.Fatalf("expected positive goroutine count, got %#v", payload.Runtime)
	}
}

func TestIceServersResponse(t *testing.T) {
	ice, _ := domain.NewIceServer("stun:turn-primary:3478", domain.IceServerSTUN, "", "", true)
	server := newTestServer(fakeStreams{}, fakeIce{servers: []domain.IceServer{ice}})
	request := httptest.NewRequest(http.MethodGet, "/v1/ice-servers", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	payload := decodeTestJSON[iceServersResponse](t, recorder)
	if len(payload.IceServers) != 1 {
		t.Fatalf("expected one ice server, got %d", len(payload.IceServers))
	}
}

func TestIceServersRequiresAuthorizationBeforeReturningTurnCredentials(t *testing.T) {
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServerWithAuthorizer(
		fakeStreams{},
		fakeIce{servers: []domain.IceServer{ice}},
		fakeAuthorizer{errByStream: map[string]error{
			"control.ice-servers": domain.ErrStreamAuthenticationRequired,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/v1/ice-servers", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "gcs-turn") || strings.Contains(body, "secret") || strings.Contains(body, "turn-primary") {
		t.Fatalf("unauthorized ICE response leaked TURN data: %s", body)
	}
}

func TestStreamListResponse(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	server := newTestServer(fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestLegacyStreamStatusResponse(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/stream/status", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if recorder.Header().Get("Deprecation") != "true" {
		t.Fatalf("expected deprecation header, got %q", recorder.Header().Get("Deprecation"))
	}
	if recorder.Header().Get("X-GCS-Replacement-Route") != "/media-control/api/v1/streams" {
		t.Fatalf("unexpected replacement header %q", recorder.Header().Get("X-GCS-Replacement-Route"))
	}
	payload := decodeTestJSON[legacyStreamStatusResponse](t, recorder)
	if payload.Stream != "ready" {
		t.Fatalf("unexpected payload %#v", payload)
	}
	if payload.Service != mediaControlServiceName || payload.Status != healthStatusOK {
		t.Fatalf("expected media-control ok payload, got %#v", payload)
	}
	if !payload.Deprecated || payload.Replacement != "/media-control/api/v1/streams" {
		t.Fatalf("expected deprecated compatibility metadata, got %#v", payload)
	}
}

func TestDashboardStreamListContract(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{
			Path:        path,
			Ready:       true,
			Source:      "webRTCSession",
			Status:      domain.StreamStatusOnline,
			ReaderCount: 1,
		}}},
		fakeIce{},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	payload := decodeTestJSON[[]streamDescriptorResponse](t, recorder)
	if payload[0].StreamID != "raw.local.webcam" {
		t.Fatalf("unexpected streamId %v", payload[0].StreamID)
	}
	if payload[0].Status != domain.StreamStatusOnline {
		t.Fatalf("unexpected status %v", payload[0].Status)
	}
	webrtcURL := payload[0].PlaybackURLs.WebRTC
	if !strings.HasPrefix(webrtcURL, "http://edge.local/webrtc/raw/local/webcam/whep?") {
		t.Fatalf("unexpected webrtc URL %v", webrtcURL)
	}
	assertMediaURLToken(t, webrtcURL, playbackTokenQueryKey, mediaMTXActionPlayback, "raw/local/webcam")
}

func TestDashboardStreamListFiltersDeniedStreams(t *testing.T) {
	allowedPath, _ := domain.NewStreamPath("raw/sample/front")
	deniedPath, _ := domain.NewStreamPath("raw/company-b/front")
	server := newTestServerWithAuthorizer(
		fakeStreams{streams: []domain.StreamDescriptor{
			{Path: allowedPath, Ready: true, Status: domain.StreamStatusOnline},
			{Path: deniedPath, Ready: true, Status: domain.StreamStatusOnline},
		}},
		fakeIce{},
		fakeAuthorizer{errByStream: map[string]error{
			"raw.company-b.front": domain.ErrStreamAccessDenied,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	payload := decodeTestJSON[[]streamDescriptorResponse](t, recorder)
	if len(payload) != 1 || payload[0].StreamID != "raw.sample.front" {
		t.Fatalf("expected only allowed stream, got %#v", payload)
	}
}

func TestDashboardStreamListForwardsAuthorizationHeader(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/sample/front")
	observedAuth := ""
	server := newTestServerWithAuthorizer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{},
		fakeAuthorizer{observedAuth: &observedAuth},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	request.Header.Set("Authorization", "Bearer dashboard-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if observedAuth != "Bearer dashboard-token" {
		t.Fatalf("expected authorization header to be forwarded, got %q", observedAuth)
	}
}

func TestDashboardPlaybackStatusAndDetailContracts(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{},
	)

	for _, route := range []string{
		"/api/v1/streams/raw.local.webcam",
		"/api/v1/streams/raw.local.webcam/playback",
		"/api/v1/streams/raw.local.webcam/status",
	} {
		request := httptest.NewRequest(http.MethodGet, route, nil)
		recorder := httptest.NewRecorder()

		server.Routes().ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("%s expected 200, got %d: %s", route, recorder.Code, recorder.Body.String())
		}
	}
}

func TestDashboardStreamListRequiresAuthorizationWhenPolicyRequiresIt(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/sample/front")
	server := newTestServerWithAuthorizer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{},
		fakeAuthorizer{errByStream: map[string]error{
			"raw.sample.front": domain.ErrStreamAuthenticationRequired,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestDashboardStreamListRequiresAuthorizationBeforeQueryingRegistry(t *testing.T) {
	server := newTestServerWithAuthorizer(
		fakeStreams{err: errors.New("registry must not be queried before stream-list authorization")},
		fakeIce{},
		fakeAuthorizer{errByStream: map[string]error{
			"control.stream-list": domain.ErrStreamAuthenticationRequired,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 before registry access, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestDashboardPlaybackDeniesForbiddenStream(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/company-b/front")
	server := newTestServerWithAuthorizer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{},
		fakeAuthorizer{errByStream: map[string]error{
			"raw.company-b.front": domain.ErrStreamAccessDenied,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.company-b.front/playback", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func TestDashboardStreamItemReturnsCompatibilityErrors(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})

	invalid := httptest.NewRequest(http.MethodGet, "/api/v1/streams/bad", nil)
	invalidRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(invalidRecorder, invalid)
	if invalidRecorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", invalidRecorder.Code)
	}

	missing := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.missing.front", nil)
	missingRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(missingRecorder, missing)
	if missingRecorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", missingRecorder.Code)
	}
}

func TestDashboardIceServersContract(t *testing.T) {
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServer(fakeStreams{}, fakeIce{servers: []domain.IceServer{ice}})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/ice-servers", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	payload := decodeTestJSON[[]iceServerResponse](t, recorder)
	if payload[0].URLs != "turn:turn-primary:3478" {
		t.Fatalf("unexpected ice URL %v", payload[0].URLs)
	}
	if payload[0].Username == nil || *payload[0].Username != "gcs-turn" {
		t.Fatalf("unexpected username %v", payload[0].Username)
	}
}

func TestDashboardIceServersRequiresAuthorizationBeforeReturningTurnCredentials(t *testing.T) {
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServerWithAuthorizer(
		fakeStreams{},
		fakeIce{servers: []domain.IceServer{ice}},
		fakeAuthorizer{errByStream: map[string]error{
			"control.ice-servers": domain.ErrStreamAuthenticationRequired,
		}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/ice-servers", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
	body := recorder.Body.String()
	if strings.Contains(body, "gcs-turn") || strings.Contains(body, "secret") || strings.Contains(body, "turn-primary") {
		t.Fatalf("unauthorized ICE response leaked TURN data: %s", body)
	}
}

func TestDashboardIceServersForwardsAuthorizationHeader(t *testing.T) {
	ice, _ := domain.NewIceServer("turn:turn-primary:3478", domain.IceServerTURN, "gcs-turn", "secret", true)
	observedAuth := ""
	server := newTestServerWithAuthorizer(
		fakeStreams{},
		fakeIce{servers: []domain.IceServer{ice}},
		fakeAuthorizer{observedAuth: &observedAuth},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/ice-servers", nil)
	request.Header.Set("Authorization", "Bearer dashboard-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
	if observedAuth != "Bearer dashboard-token" {
		t.Fatalf("expected authorization header to be forwarded, got %q", observedAuth)
	}
}

func TestDashboardPublishUrlRequiresAuthorizationAndAppendsPublisherToken(t *testing.T) {
	path, _ := domain.NewStreamPath("raw/local/webcam")
	ice, _ := domain.NewIceServer("stun:a4ai.tplinkdns.com:3478", domain.IceServerSTUN, "", "", true)
	server := newTestServer(
		fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true, Status: domain.StreamStatusOnline}}},
		fakeIce{servers: []domain.IceServer{ice}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.local.webcam/publish", nil)
	request.Header.Set("Authorization", "Bearer publisher-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[streamPublishResponse](t, recorder)
	if payload.StreamID != "raw.local.webcam" {
		t.Fatalf("unexpected streamId %v", payload.StreamID)
	}
	whipURL := payload.WhipURL
	if !strings.HasPrefix(whipURL, "http://edge.local/webrtc/raw/local/webcam/whip?") {
		t.Fatalf("unexpected publish URL %v", payload.WhipURL)
	}
	if len(payload.IceServers) != 1 || payload.IceServers[0].URLs != "stun:a4ai.tplinkdns.com:3478" {
		t.Fatalf("expected publish response to include authorized ICE servers, got %#v", payload.IceServers)
	}
	assertMediaURLToken(t, whipURL, publisherTokenQueryKey, mediaMTXActionPublish, "raw/local/webcam")
}

func TestDashboardPublishUrlCanBeIssuedBeforeStreamIsRegistered(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.new-drone.front/publish", nil)
	request.Header.Set("Authorization", "Bearer publisher-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[streamPublishResponse](t, recorder)
	whipURL := payload.WhipURL
	if !strings.HasPrefix(whipURL, "http://edge.local/webrtc/raw/new-drone/front/whip?") {
		t.Fatalf("unexpected publish URL %v", payload.WhipURL)
	}
	assertMediaURLToken(t, whipURL, publisherTokenQueryKey, mediaMTXActionPublish, "raw/new-drone/front")
}

func TestDashboardTalkbackPublishUsesAuthorizedShortLivedPath(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.drone-01.front/talkback-publish?operatorId=operator01", nil)
	request.Header.Set("Authorization", "Bearer operator-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[streamPublishResponse](t, recorder)
	if !strings.HasPrefix(payload.WhipURL, "http://edge.local/webrtc/talkback/raw/drone-01/front/operator01/whip?") {
		t.Fatalf("unexpected talkback publish URL %v", payload.WhipURL)
	}
	assertMediaURLToken(t, payload.WhipURL, publisherTokenQueryKey, mediaMTXActionPublish, "talkback/raw/drone-01/front/operator01")
}

func TestDashboardTalkbackPublishRejectsNonRawTarget(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/ai.drone-01.front.detector/talkback-publish", nil)
	request.Header.Set("Authorization", "Bearer operator-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestDashboardPublishUrlUsesDevicePolicyWithoutGroupID(t *testing.T) {
	var observed domain.DevicePublishCommand
	ice, _ := domain.NewIceServer("turn:a4ai.tplinkdns.com:3478?transport=udp", domain.IceServerTURN, "gcs-turn", "secret", true)
	server := newTestServerWithDevicePublisher(
		fakeStreams{},
		fakeIce{servers: []domain.IceServer{ice}},
		fakeDevicePublisher{observed: &observed},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.drone-01.front/publish", nil)
	request.Header.Set(deviceUUIDHeader, "device-uuid-001")
	request.Header.Set(deviceCredentialHeader, "device-secret")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if observed.DeviceUUID != "device-uuid-001" || observed.Credential != "device-secret" {
		t.Fatalf("expected device credential to be forwarded, got %#v", observed)
	}
	if observed.SensorID != "front" || observed.StreamID != "" || observed.Path != "" {
		t.Fatalf("unexpected device publish command %#v", observed)
	}
	payload := decodeTestJSON[streamPublishResponse](t, recorder)
	assertMediaURLTokenForGroup(t, payload.WhipURL, publisherTokenQueryKey, mediaMTXActionPublish, "raw/drone-01/front", "co-device")
	if len(payload.IceServers) != 1 || payload.IceServers[0].Credential == nil {
		t.Fatalf("expected device publish response to include authorized TURN credentials, got %#v", payload.IceServers)
	}
}

func TestDashboardPublishUrlRejectsInvalidDeviceCredential(t *testing.T) {
	server := newTestServerWithDevicePublisher(
		fakeStreams{},
		fakeIce{},
		fakeDevicePublisher{err: domain.ErrDevicePublishAccessDenied},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.drone-01.front/publish", nil)
	request.Header.Set(deviceUUIDHeader, "device-uuid-001")
	request.Header.Set(deviceCredentialHeader, "wrong-secret")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestDashboardPublishUrlRejectsPartialDeviceCredential(t *testing.T) {
	server := newTestServerWithDevicePublisher(fakeStreams{}, fakeIce{}, fakeDevicePublisher{})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.drone-01.front/publish", nil)
	request.Header.Set(deviceUUIDHeader, "device-uuid-001")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaMTXPublishAuthRejectsMissingPublisherToken(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"publish","path":"raw/local/webcam","protocol":"webrtc","query":""}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "test-publish-token") {
		t.Fatalf("publish auth response leaked token: %s", recorder.Body.String())
	}
}

func TestMediaMTXPublishAuthAcceptsValidPublisherToken(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	token, err := issueMediaToken("test-publish-token", mediaMTXActionPublish, "raw.local.webcam", "raw/local/webcam", "co-a", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"publish","path":"raw/local/webcam","protocol":"webrtc","query":"publisherToken=`+token+`"}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaMTXPlaybackAuthRejectsMissingPlaybackToken(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"playback","path":"raw/local/webcam","protocol":"webrtc"}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), "test-publish-token") {
		t.Fatalf("playback auth response leaked token: %s", recorder.Body.String())
	}
}

func TestMediaMTXPlaybackAuthAcceptsIssuedPlaybackToken(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	token, err := issueMediaToken("test-publish-token", mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"read","path":"raw/local/webcam","protocol":"webrtc","query":"playbackToken=`+token+`"}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaTokenRejectsWrongStreamAndExpiredToken(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	token, err := issueMediaToken("test-publish-token", mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", now)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateMediaToken("test-publish-token", token, mediaMTXActionPlayback, "raw.other.webcam", "raw/other/webcam", "co-a", now); err == nil {
		t.Fatal("expected wrong stream path to be rejected")
	}
	if err := validateMediaToken("test-publish-token", token, mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-b", now); err == nil {
		t.Fatal("expected wrong group id to be rejected")
	}
	if err := validateMediaToken("test-publish-token", token, mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", now.Add(mediaTokenTTL+time.Second)); err == nil {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestMediaMTXPublishAuthRejectsTokenIssuedForDifferentPath(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	token, err := issueMediaToken("test-publish-token", mediaMTXActionPublish, "raw.company-c.front", "raw/company-c/front", "co-device", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"publish","path":"raw/company-b/front","protocol":"webrtc","query":"publisherToken=`+token+`"}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaMTXPublishAuthAcceptsSignedDeviceGroupClaim(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	token, err := issueMediaToken("test-publish-token", mediaMTXActionPublish, "raw.company-b.front", "raw/company-b/front", "co-device", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/mediamtx/auth",
		strings.NewReader(`{"action":"publish","path":"raw/company-b/front","protocol":"webrtc","query":"publisherToken=`+token+`"}`),
	)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func newTestServer(streams StreamLister, ice IceServerProvider) Server {
	return newTestServerWithAuthorizer(streams, ice, fakeAuthorizer{})
}

func newTestServerWithAuthorizer(streams StreamLister, ice IceServerProvider, authorizer StreamAuthorizer) Server {
	playback, err := domain.NewPlaybackURLBuilder("http://edge.local/webrtc", "http://edge.local/hls")
	if err != nil {
		panic(err)
	}
	groups, err := domain.NewStreamGroupResolver("co-a", "raw/company-b/front=co-b")
	if err != nil {
		panic(err)
	}
	return NewServer(streams, ice, playback, authorizer, groups, "test-publish-token")
}

func newTestServerWithDevicePublisher(
	streams StreamLister,
	ice IceServerProvider,
	devicePublisher DevicePublishAuthorizer,
) Server {
	return newTestServer(streams, ice).WithDevicePublishAuthorizer(devicePublisher)
}

func assertMediaURLToken(t *testing.T, rawURL string, key string, action string, streamPath string) {
	assertMediaURLTokenForGroup(t, rawURL, key, action, streamPath, "co-a")
}

func assertMediaURLTokenForGroup(
	t *testing.T,
	rawURL string,
	key string,
	action string,
	streamPath string,
	groupID string,
) {
	t.Helper()
	parsed, err := url.Parse(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	token := parsed.Query().Get(key)
	if token == "" {
		t.Fatalf("expected %s in %s", key, rawURL)
	}
	if strings.Contains(token, "test-publish-token") {
		t.Fatalf("media URL leaked raw signing secret: %s", rawURL)
	}
	streamPathParts, err := domain.ParseStreamPath(streamPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateMediaToken("test-publish-token", token, action, streamPathParts.StreamID, streamPath, groupID, time.Now()); err != nil {
		t.Fatalf("expected valid media token in %s: %v", rawURL, err)
	}
}
