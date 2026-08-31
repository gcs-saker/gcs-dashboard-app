package httpapi

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)
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
	var observedTarget domain.StreamAccessTarget
	server := newTestServerWithAuthorizer(fakeStreams{}, fakeIce{}, fakeAuthorizer{observedTarget: &observedTarget})
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
	if observedTarget.Action != "send_talkback" {
		t.Fatalf("expected send_talkback authorization action, got %q", observedTarget.Action)
	}
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

func TestDashboardTalkbackPlaybackUsesAuthorizedShortLivedPath(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.drone-01.front/talkback-playback", nil)
	request.Header.Set("Authorization", "Bearer receiver-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	payload := decodeTestJSON[streamPlaybackResponse](t, recorder)
	if !strings.HasPrefix(payload.PlaybackURLs.WebRTC, "http://edge.local/webrtc/talkback/raw/drone-01/front/operator/whep?") {
		t.Fatalf("unexpected talkback playback URL %v", payload.PlaybackURLs.WebRTC)
	}
	assertMediaURLToken(t, payload.PlaybackURLs.WebRTC, playbackTokenQueryKey, mediaMTXActionPlayback, "talkback/raw/drone-01/front/operator")
	playbackURL, err := url.Parse(payload.PlaybackURLs.WebRTC)
	if err != nil {
		t.Fatal(err)
	}
	authRequest := httptest.NewRequest(http.MethodPost, routeMediaMTXAuth, strings.NewReader(`{"action":"read","path":"talkback/raw/drone-01/front/operator","protocol":"webrtc","query":"`+playbackURL.RawQuery+`"}`))
	authRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(authRecorder, authRequest)
	if authRecorder.Code != http.StatusNoContent {
		t.Fatalf("expected MediaMTX talkback playback authorization, got %d: %s", authRecorder.Code, authRecorder.Body.String())
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
