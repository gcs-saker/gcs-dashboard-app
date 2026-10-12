package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	publishSessionGlobalRequestsPerMinute  = 600
	publishSessionSubjectRequestsPerMinute = 30
	publishSessionTrackedSubjects          = 10_000
)

type fixedWindowLimiter struct {
	mu      sync.Mutex
	windows map[string]rateWindow
	limit   int
	window  time.Duration
	maxKeys int
	now     func() time.Time
}

type rateWindow struct {
	count   int
	resetAt time.Time
}

func newFixedWindowLimiter(limit int, window time.Duration, maxKeys int) *fixedWindowLimiter {
	return &fixedWindowLimiter{windows: make(map[string]rateWindow), limit: limit, window: window, maxKeys: maxKeys, now: time.Now}
}

func (l *fixedWindowLimiter) allow(key string) (bool, int64) {
	if !l.configured() {
		return false, 1
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	if len(l.windows) >= l.maxKeys {
		l.cleanup(now)
	}
	current, found := l.windows[key]
	if !found && len(l.windows) >= l.maxKeys {
		return false, int64(l.window.Seconds())
	}
	if windowExpired(found, current, now) {
		l.windows[key] = rateWindow{count: 1, resetAt: now.Add(l.window)}
		return true, 0
	}
	current.count++
	l.windows[key] = current
	if current.count <= l.limit {
		return true, 0
	}
	return false, max(int64(current.resetAt.Sub(now).Seconds()), 1)
}

func (l *fixedWindowLimiter) configured() bool {
	return l != nil && l.limit > 0 && l.window > 0 && l.maxKeys > 0
}

func windowExpired(found bool, current rateWindow, now time.Time) bool {
	return !found || !now.Before(current.resetAt)
}

func (l *fixedWindowLimiter) cleanup(now time.Time) {
	removed := 0
	for key, current := range l.windows {
		if !now.Before(current.resetAt) {
			delete(l.windows, key)
			removed++
			if removed >= 64 {
				return
			}
		}
	}
}

func (s Server) allowPublishSessionRequest(w http.ResponseWriter, r *http.Request) bool {
	globalAllowed, globalRetry := s.publishGlobal.allow("global")
	subjectAllowed, subjectRetry := s.publishSubjects.allow(publishSubjectKey(r))
	if globalAllowed && subjectAllowed {
		return true
	}
	retryAfter := max(globalRetry, subjectRetry)
	w.Header().Set("Retry-After", strconv.FormatInt(retryAfter, 10))
	writeJSON(w, http.StatusTooManyRequests, errorPayload("publish session rate limit exceeded"))
	return false
}

func publishSubjectKey(r *http.Request) string {
	material := strings.Join([]string{
		r.Header.Get(authorizationHeader),
		r.Header.Get(deviceUUIDHeader),
		r.Header.Get(deviceCredentialHeader),
	}, "\x00")
	if strings.Trim(material, "\x00") == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			material = host
		} else {
			material = r.RemoteAddr
		}
	}
	digest := sha256.Sum256([]byte(material))
	return hex.EncodeToString(digest[:])
}
