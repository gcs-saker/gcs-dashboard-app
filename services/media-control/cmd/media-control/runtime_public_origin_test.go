package main

import "testing"

func TestValidateExpectedPublicOriginAcceptsMatchingMediaEndpoints(t *testing.T) {
	err := validateExpectedPublicOrigin(
		"https://staging.example.test:8443",
		"https://staging.example.test:8443/webrtc",
		"https://staging.example.test:8443/hls",
	)
	if err != nil {
		t.Fatal(err)
	}
}

func TestValidateExpectedPublicOriginRejectsCrossEnvironmentDrift(t *testing.T) {
	err := validateExpectedPublicOrigin(
		"https://staging.example.test:8443",
		"https://production.example.test/webrtc",
		"https://staging.example.test:8443/hls",
	)
	if err == nil {
		t.Fatal("expected cross-environment public origin to be rejected")
	}
}

func TestValidateExpectedPublicOriginRejectsPathInOriginContract(t *testing.T) {
	if validateExpectedPublicOrigin("https://example.test/staging", "https://example.test/webrtc") == nil {
		t.Fatal("expected origin containing a path to be rejected")
	}
}
