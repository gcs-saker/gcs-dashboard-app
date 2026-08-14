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
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
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
	errByStream    map[string]error
	observedAuth   *string
	observedTarget *domain.StreamAccessTarget
}

func (f fakeAuthorizer) AuthorizeStream(
	_ context.Context,
	authorization string,
	target domain.StreamAccessTarget,
) (domain.StreamAccessDecision, error) {
	if f.observedAuth != nil {
		*f.observedAuth = authorization
	}
	if f.observedTarget != nil {
		*f.observedTarget = target
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
	if err := sessiontoken.Validate("test-publish-token", token, action, streamPathParts.StreamID, streamPath, groupID, time.Now()); err != nil {
		t.Fatalf("expected valid media token in %s: %v", rawURL, err)
	}
}
