package authpolicy

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestControlClientUsesAuthenticatedInternalPolicyBoundary(t *testing.T) {
	var body, authorization string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, authorization = readBody(r), r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"allowed":true,"reason":"allowed","groupId":"co-a"}`))
	}))
	defer server.Close()
	decision, err := NewClient(server.URL, server.Client()).AuthorizeControl(context.Background(), "Bearer opaque",
		ControlAccessTarget{Action: "acquire", DeviceID: "device-01", Command: "STOP", Now: time.Unix(10, 0)})
	if err != nil || !decision.Allowed || authorization != "Bearer opaque" {
		t.Fatalf("unexpected decision=%+v auth=%q err=%v", decision, authorization, err)
	}
	if !strings.Contains(body, `"deviceId":"device-01"`) || strings.Contains(body, "topic") || strings.Contains(body, "receiver") {
		t.Fatalf("unexpected control policy payload: %s", body)
	}
}

func readBody(request *http.Request) string {
	wire, _ := io.ReadAll(request.Body)
	return string(wire)
}

func TestControlClientFailsClosedForDeniedDecision(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"allowed":false,"reason":"cross_group","groupId":"co-b"}`))
	}))
	defer server.Close()
	_, err := NewClient(server.URL, server.Client()).AuthorizeControl(context.Background(), "Bearer opaque",
		ControlAccessTarget{Action: "command", DeviceID: "device-01", Command: "STOP", Now: time.Now()})
	if err == nil {
		t.Fatal("denied policy decision must fail closed")
	}
}
