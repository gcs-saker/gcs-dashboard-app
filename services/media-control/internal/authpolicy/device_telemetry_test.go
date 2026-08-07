package authpolicy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthenticateDeviceRequiresAndReturnsServerOwnedGroupIdentity(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/policy/devices/authenticate" {
			t.Fatalf("unexpected path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"deviceUuid":"device-001","groupId":"co-a","credentialVersion":2,"devicePolicyVersion":4}`))
	}))
	defer server.Close()

	authentication, err := NewClient(server.URL, server.Client()).AuthenticateDevice(
		context.Background(), "device-001", "credential",
	)
	if err != nil {
		t.Fatal(err)
	}
	if authentication.DeviceUUID != "device-001" || authentication.GroupID != "co-a" {
		t.Fatalf("unexpected authentication identity: %#v", authentication)
	}
}

func TestAuthenticateDeviceRejectsIdentityWithoutGroup(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"deviceUuid":"device-001","credentialVersion":2,"devicePolicyVersion":4}`))
	}))
	defer server.Close()

	_, err := NewClient(server.URL, server.Client()).AuthenticateDevice(
		context.Background(), "device-001", "credential",
	)
	if err == nil {
		t.Fatal("expected incomplete identity to be rejected")
	}
}
