package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeControlService struct{}

func (fakeControlService) CreateSession(context.Context, string, ControlSessionRequest) (ControlSessionResponse, error) {
	return ControlSessionResponse{"control-opaque", "2026-09-23T01:00:00Z", 1000}, nil
}

func (fakeControlService) SubmitCommand(context.Context, string, string, ControlCommandRequest) (ControlCommandResponse, error) {
	return ControlCommandResponse{"command-opaque", "accepted"}, nil
}

func TestControlSessionAPIIsFailClosedWhenRuntimeIsNotWired(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, routeControlSessions, strings.NewReader(`{"deviceId":"device-01","publishSessionId":"session-01"}`))
	request.Header.Set(authorizationHeader, "Bearer test")
	recorder := httptest.NewRecorder()
	newTestServer(fakeStreams{}, fakeIce{}).Routes().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", recorder.Code)
	}
}

func TestControlSessionAPIExposesOnlyOpaquePublicFields(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, routeControlSessions, strings.NewReader(`{"deviceId":"device-01","publishSessionId":"session-01"}`))
	request.Header.Set(authorizationHeader, "Bearer test")
	recorder := httptest.NewRecorder()
	newTestServer(fakeStreams{}, fakeIce{}).WithControlService(fakeControlService{}).Routes().ServeHTTP(recorder, request)
	body := recorder.Body.String()
	if recorder.Code != http.StatusCreated || strings.Contains(body, "topic") || strings.Contains(body, "group") || strings.Contains(body, "receiver") {
		t.Fatalf("unexpected public control response: status=%d body=%s", recorder.Code, body)
	}
}

func TestControlCommandAPIValidatesOpaqueSessionAndCommandBoundary(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, routeControlSessionPrefix+"control-opaque/commands",
		strings.NewReader(`{"command":"STOP","sequence":1,"idempotencyId":"idem-1"}`))
	request.Header.Set(authorizationHeader, "Bearer test")
	recorder := httptest.NewRecorder()
	newTestServer(fakeStreams{}, fakeIce{}).WithControlService(fakeControlService{}).Routes().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusAccepted || !strings.Contains(recorder.Body.String(), "command-opaque") {
		t.Fatalf("unexpected command response: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}
