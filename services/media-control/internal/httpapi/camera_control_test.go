package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCameraControlStoresAuthorizedFacingCommand(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	post := httptest.NewRequest(http.MethodPost, "/api/v1/streams/raw.mobile.front/camera-control", strings.NewReader(`{"facingMode":"rear"}`))
	post.Header.Set(authorizationHeader, "Bearer operator-token")
	postRecorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(postRecorder, post)

	if postRecorder.Code != http.StatusOK {
		t.Fatalf("expected camera command 200, got %d: %s", postRecorder.Code, postRecorder.Body.String())
	}
	posted := decodeTestJSON[cameraCommand](t, postRecorder)
	if posted.FacingMode != "rear" || posted.Revision != 1 {
		t.Fatalf("unexpected camera command: %#v", posted)
	}

	get := httptest.NewRequest(http.MethodGet, "/api/v1/streams/raw.mobile.front/camera-control", nil)
	get.Header.Set(authorizationHeader, "Bearer publisher-token")
	getRecorder := httptest.NewRecorder()
	server.Routes().ServeHTTP(getRecorder, get)
	read := decodeTestJSON[cameraCommand](t, getRecorder)
	if read != posted {
		t.Fatalf("camera command was not retained: %#v", read)
	}
}

func TestCameraControlRejectsInvalidFacingMode(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{})
	request := httptest.NewRequest(http.MethodPost, "/api/v1/streams/raw.mobile.front/camera-control", strings.NewReader(`{"facingMode":"side"}`))
	request.Header.Set(authorizationHeader, "Bearer operator-token")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid camera mode 400, got %d", recorder.Code)
	}
}
