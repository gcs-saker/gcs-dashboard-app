package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestFixedWindowLimiterBoundsKeysAndRecoversAfterWindow(t *testing.T) {
	now := time.Unix(100, 0)
	limiter := newFixedWindowLimiter(2, time.Minute, 1)
	limiter.now = func() time.Time { return now }

	if allowed, _ := limiter.allow("subject-a"); !allowed {
		t.Fatal("first request was rejected")
	}
	if allowed, _ := limiter.allow("subject-a"); !allowed {
		t.Fatal("second request was rejected")
	}
	if allowed, retry := limiter.allow("subject-a"); allowed || retry < 1 || retry > 60 {
		t.Fatalf("limit was not enforced: allowed=%v retry=%d", allowed, retry)
	}
	if allowed, _ := limiter.allow("subject-b"); allowed {
		t.Fatal("tracked key bound was bypassed")
	}
	now = now.Add(time.Minute)
	if allowed, _ := limiter.allow("subject-b"); !allowed {
		t.Fatal("limiter did not recover after expiry")
	}
}

func TestPublishSessionLimiterUsesHashedSubjectAndReturns429(t *testing.T) {
	server := newTestServer(fakeStreams{}, fakeIce{}).WithPublishSessionRateLimits(
		newFixedWindowLimiter(10, time.Minute, 1),
		newFixedWindowLimiter(1, time.Minute, 10),
	)
	request := httptest.NewRequest(http.MethodPost, routeAccountPublishSessions, strings.NewReader(`{}`))
	request.Header.Set(authorizationHeader, "Bearer sensitive-account-token")
	first := httptest.NewRecorder()
	if !server.allowPublishSessionRequest(first, request) {
		t.Fatal("first publish session request was rejected")
	}
	second := httptest.NewRecorder()

	if server.allowPublishSessionRequest(second, request) {
		t.Fatal("repeated publish session request bypassed the limit")
	}
	if second.Code != http.StatusTooManyRequests || second.Header().Get("Retry-After") == "" {
		t.Fatalf("unexpected rate limit response: %d %#v", second.Code, second.Header())
	}
	for key := range server.publishSubjects.windows {
		if strings.Contains(key, "sensitive-account-token") {
			t.Fatal("credential material was stored in the limiter key")
		}
	}
}
