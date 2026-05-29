package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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

func TestHealthz(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
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
	playback, err := domain.NewPlaybackURLBuilder("http://edge.local/webrtc", "http://edge.local/hls")
	if err != nil {
		panic(err)
	}
	return NewServer(streams, ice, playback)
}
