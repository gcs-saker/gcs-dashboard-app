package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
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

func TestHealthz(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
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
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected ok readiness, got %#v", payload)
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
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["status"] != "degraded" {
		t.Fatalf("expected degraded status, got %#v", payload)
	}
	assertReadinessCheck(t, payload, "stream_registry", "error", "stream registry query failed")
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
	var payload map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	assertReadinessCheck(t, payload, "ice_servers", "error", "no healthy ICE servers available")
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
	var payload map[string][]domain.IceServer
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload["iceServers"]) != 1 {
		t.Fatalf("expected one ice server, got %d", len(payload["iceServers"]))
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
	var payload map[string]string
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload["stream"] != "ready" {
		t.Fatalf("unexpected payload %#v", payload)
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
	var payload []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload[0]["streamId"] != "raw.local.webcam" {
		t.Fatalf("unexpected streamId %v", payload[0]["streamId"])
	}
	if payload[0]["status"] != "online" {
		t.Fatalf("unexpected status %v", payload[0]["status"])
	}
	playback := payload[0]["playbackUrls"].(map[string]any)
	if playback["webrtc"] != "http://edge.local/webrtc/raw/local/webcam/whep" {
		t.Fatalf("unexpected webrtc URL %v", playback["webrtc"])
	}
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
	var payload []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if len(payload) != 1 || payload[0]["streamId"] != "raw.sample.front" {
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
	var payload []map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload[0]["urls"] != "turn:turn-primary:3478" {
		t.Fatalf("unexpected ice URL %v", payload[0]["urls"])
	}
	if payload[0]["username"] != "gcs-turn" {
		t.Fatalf("unexpected username %v", payload[0]["username"])
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
	return NewServer(streams, ice, playback, authorizer, groups)
}

func assertReadinessCheck(t *testing.T, payload map[string]any, name string, status string, reason string) {
	t.Helper()
	checks, ok := payload["checks"].([]any)
	if !ok {
		t.Fatalf("expected checks array, got %#v", payload["checks"])
	}
	for _, rawCheck := range checks {
		check, ok := rawCheck.(map[string]any)
		if !ok {
			t.Fatalf("expected check object, got %#v", rawCheck)
		}
		if check["name"] == name {
			if check["status"] != status {
				t.Fatalf("expected %s status %s, got %#v", name, status, check)
			}
			if check["reason"] != reason {
				t.Fatalf("expected %s reason %q, got %#v", name, reason, check)
			}
			return
		}
	}
	t.Fatalf("expected readiness check %q in %#v", name, checks)
}
