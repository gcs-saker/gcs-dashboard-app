package httpapi

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestStreamListResponse(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusGone {
		t.Fatalf("expected 410, got %d", recorder.Code)
	}
	if recorder.Header().Get(replacementRouteHeader) != legacyStreamStatusReplacement {
		t.Fatalf("missing replacement route header")
	}
	if strings.Contains(recorder.Body.String(), "raw/") {
		t.Fatalf("legacy registry leaked a private stream path: %s", recorder.Body.String())
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
	if payload[0].DisplayName != nil {
		t.Fatalf("stream diagnostics leaked through displayName: %q", *payload[0].DisplayName)
	}
	responseBody := recorder.Body.String()
	for _, privateField := range []string{"\"path\"", "\"playbackUrls\"", "webRTCSession", "readers"} {
		if strings.Contains(responseBody, privateField) {
			t.Fatalf("stream list leaked private routing detail %q: %s", privateField, responseBody)
		}
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

func TestDashboardStreamListDoesNotExposeInternalAuthorizationURL(t *testing.T) {
	internalError := errors.New(`Post "http://auth-policy:8080/policy/streams/access": connection refused`)
	server := newTestServerWithAuthorizer(
		fakeStreams{},
		fakeIce{},
		fakeAuthorizer{errByStream: map[string]error{"control.stream-list": internalError}},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "auth-policy:8080") || strings.Contains(recorder.Body.String(), "/policy/streams/access") {
		t.Fatalf("response exposed internal authorization route: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), errAuthorizationUnavailable) {
		t.Fatalf("expected sanitized authorization error, got %s", recorder.Body.String())
	}
}

func TestDashboardStreamListDoesNotExposeInternalRegistryError(t *testing.T) {
	server := newTestServer(
		fakeStreams{err: errors.New(`Get "http://mediamtx:9997/v3/paths/list": connection refused`)},
		fakeIce{},
	)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", recorder.Code)
	}
	if strings.Contains(recorder.Body.String(), "mediamtx:9997") || strings.Contains(recorder.Body.String(), "/v3/paths/list") {
		t.Fatalf("response exposed internal registry route: %s", recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), errStreamRegistryQueryFailed) {
		t.Fatalf("expected sanitized registry error, got %s", recorder.Body.String())
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
