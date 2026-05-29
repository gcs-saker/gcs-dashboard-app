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
	server := NewServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestIceServersResponse(t *testing.T) {
	ice, _ := domain.NewIceServer("stun:turn-primary:3478", domain.IceServerSTUN, "", "", true)
	server := NewServer(fakeStreams{}, fakeIce{servers: []domain.IceServer{ice}})
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
	server := NewServer(fakeStreams{streams: []domain.StreamDescriptor{{Path: path, Ready: true}}}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/v1/streams", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}
