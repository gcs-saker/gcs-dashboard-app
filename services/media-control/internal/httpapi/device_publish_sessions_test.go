package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestDevicePublishSessionUsesServerOwnedIdentityAndRotatesRenewalToken(t *testing.T) {
	observed := domain.DevicePublishCommand{}
	publisher := fakeDevicePublisher{observed: &observed, authorization: domain.DevicePublishAuthorization{
		DeviceUUID: "device-001", SensorID: "front", StreamID: "raw.device-001.front",
		Path: "raw/device-001/front", PublisherGroupID: "co-a", CredentialVersion: 2, DevicePolicyVersion: 4,
	}}
	store := domain.NewInMemoryPublishSessionStore()
	server := newTestServerWithDevicePublisher(fakeStreams{}, fakeIce{}, publisher).WithPublishSessionStore(store)

	request := httptest.NewRequest(http.MethodPost, routeDevicePublishSessions, strings.NewReader(`{"sensorId":"front"}`))
	request.Header.Set(deviceUUIDHeader, "device-001")
	request.Header.Set(deviceCredentialHeader, "long-lived-secret")
	recorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", recorder.Code, recorder.Body.String())
	}
	created := decodeTestJSON[publishSessionResponse](t, recorder)
	if observed.SensorID != "front" || observed.StreamID != "" || observed.Path != "" {
		t.Fatalf("authentication request must contain identity and sensor only: %#v", observed)
	}
	if created.StreamID != "raw.device-001.front" || strings.Contains(created.PublishURL, "token") {
		t.Fatalf("expected server-owned identity and clean URL: %#v", created)
	}
	if created.PublishToken == "" || created.RenewalToken == "" || created.AuthorizationScheme != "Bearer" {
		t.Fatalf("expected token pair: %#v", created)
	}

	renewRequest := httptest.NewRequest(http.MethodPost, routeDevicePublishSessionPrefix+created.SessionID+"/renew", nil)
	renewRequest.Header.Set(authorizationHeader, "Bearer "+created.RenewalToken)
	renewRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(renewRecorder, renewRequest)
	if renewRecorder.Code != http.StatusOK {
		t.Fatalf("expected renewal 200, got %d: %s", renewRecorder.Code, renewRecorder.Body.String())
	}
	renewed := decodeTestJSON[renewPublishSessionResponse](t, renewRecorder)
	if renewed.RenewalToken == created.RenewalToken || renewed.PublishToken == created.PublishToken {
		t.Fatal("renewal must rotate both tokens")
	}

	mismatch := httptest.NewRequest(http.MethodPost, routeDevicePublishSessionPrefix+created.SessionID+"/renew", nil)
	mismatch.Header.Set(authorizationHeader, "Bearer random-attacker-token")
	mismatchRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(mismatchRecorder, mismatch)
	if mismatchRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected mismatch rejection, got %d", mismatchRecorder.Code)
	}
	if session, ok := store.Find(created.SessionID); !ok || session.Status != domain.PublishSessionActive {
		t.Fatal("an unrelated token mismatch must not terminate a valid session")
	}

	replay := httptest.NewRequest(http.MethodPost, routeDevicePublishSessionPrefix+created.SessionID+"/renew", nil)
	replay.Header.Set(authorizationHeader, "Bearer "+created.RenewalToken)
	replayRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(replayRecorder, replay)
	if replayRecorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected replay rejection, got %d", replayRecorder.Code)
	}
	if session, ok := store.Find(created.SessionID); !ok || session.Status != domain.PublishSessionEnded {
		t.Fatal("renewal replay must end the session")
	}
}

func TestDevicePublishSessionRejectsClientOwnedDestinationFields(t *testing.T) {
	server := newTestServerWithDevicePublisher(fakeStreams{}, fakeIce{}, fakeDevicePublisher{}).
		WithPublishSessionStore(domain.NewInMemoryPublishSessionStore())
	request := httptest.NewRequest(http.MethodPost, routeDevicePublishSessions, strings.NewReader(`{"sensorId":"front","groupId":"co-b","path":"raw/co-b/front"}`))
	request.Header.Set(deviceUUIDHeader, "device-001")
	request.Header.Set(deviceCredentialHeader, "secret")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestClientIPTrustsForwardedHeaderOnlyFromPrivateProxy(t *testing.T) {
	request := httptest.NewRequest(http.MethodPost, routeDevicePublishSessions, nil)
	request.RemoteAddr = "10.0.0.2:1234"
	request.Header.Set(forwardedForHeader, "203.0.113.9, 10.0.0.1")
	if got := clientIP(request); got != "203.0.113.9" {
		t.Fatalf("unexpected forwarded IP %q", got)
	}

	request.RemoteAddr = "198.51.100.10:1234"
	if got := clientIP(request); got != "198.51.100.10" {
		t.Fatalf("untrusted peer spoofed forwarded IP: %q", got)
	}
}

func TestPublishSessionResponseNeverSerializesCredential(t *testing.T) {
	payload, err := json.Marshal(publishSessionResponse{SessionID: "session", PublishToken: "short", RenewalToken: "renew"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(payload), "credential") || strings.Contains(string(payload), "deviceUuid") {
		t.Fatalf("private device identity leaked in response: %s", payload)
	}
}
