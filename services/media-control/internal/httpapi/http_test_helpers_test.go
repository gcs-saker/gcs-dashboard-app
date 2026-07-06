package httpapi

import (
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func decodeTestJSON[T any](t *testing.T, recorder *httptest.ResponseRecorder) T {
	t.Helper()
	var payload T
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response body: %v", err)
	}
	return payload
}

func assertReadyCheck(t *testing.T, payload readinessResponse, name string, status string, reason string) {
	t.Helper()
	for _, check := range payload.Checks {
		if check.Name != name {
			continue
		}
		if check.Status != status {
			t.Fatalf("expected %s status %s, got %#v", name, status, check)
		}
		if reason == "" {
			if check.Reason != "" {
				t.Fatalf("expected %s reason to be omitted, got %#v", name, check)
			}
			return
		}
		if check.Reason != reason {
			t.Fatalf("expected %s reason %q, got %#v", name, reason, check)
		}
		return
	}
	t.Fatalf("expected readiness check %q in %#v", name, payload.Checks)
}
