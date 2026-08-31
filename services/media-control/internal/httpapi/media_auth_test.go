package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)
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
	token, err := sessiontoken.Issue("test-publish-token", mediaMTXActionPublish, "raw.local.webcam", "raw/local/webcam", "co-a", time.Now())
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
	token, err := sessiontoken.Issue("test-publish-token", mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", time.Now())
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
	token, err := sessiontoken.Issue("test-publish-token", mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", now)
	if err != nil {
		t.Fatal(err)
	}
	if err := sessiontoken.Validate("test-publish-token", token, mediaMTXActionPlayback, "raw.other.webcam", "raw/other/webcam", "co-a", now); err == nil {
		t.Fatal("expected wrong stream path to be rejected")
	}
	if err := sessiontoken.Validate("test-publish-token", token, mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-b", now); err == nil {
		t.Fatal("expected wrong group id to be rejected")
	}
	if err := sessiontoken.Validate("test-publish-token", token, mediaMTXActionPlayback, "raw.local.webcam", "raw/local/webcam", "co-a", now.Add(sessiontoken.TTL+time.Second)); err == nil {
		t.Fatal("expected expired token to be rejected")
	}
}

func TestMediaMTXPublishAuthRejectsTokenIssuedForDifferentPath(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	token, err := sessiontoken.Issue("test-publish-token", mediaMTXActionPublish, "raw.company-c.front", "raw/company-c/front", "co-device", time.Now())
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
	token, err := sessiontoken.Issue("test-publish-token", mediaMTXActionPublish, "raw.company-b.front", "raw/company-b/front", "co-device", time.Now())
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
