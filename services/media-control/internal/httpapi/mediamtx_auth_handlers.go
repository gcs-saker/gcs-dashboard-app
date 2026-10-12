package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

func (s Server) mediaMTXAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var payload mediaMTXAuthRequest
	limitedBody := http.MaxBytesReader(w, r.Body, maxMediaMTXAuthBody)
	if err := json.NewDecoder(limitedBody).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload(errPublisherAuthFailed))
		return
	}
	switch payload.Action {
	case mediaMTXActionAPI:
		validPassword := subtle.ConstantTimeCompare([]byte(payload.Password), []byte(s.mediaMTXAPIPass)) == 1
		if s.mediaMTXAPIUser == "" || s.mediaMTXAPIPass == "" || payload.User != s.mediaMTXAPIUser || !validPassword {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case mediaMTXActionPublish:
		s.authorizeMediaMTXPublish(w, payload)
	case mediaMTXActionRead, mediaMTXActionPlayback:
		s.authorizeMediaMTXPlayback(w, payload)
	default:
		w.WriteHeader(http.StatusForbidden)
	}
}

func (s Server) authorizeMediaMTXPublish(w http.ResponseWriter, payload mediaMTXAuthRequest) {
	if s.publishToken == "" {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	parsed, err := domain.ParseStreamPath(payload.Path)
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	values, err := url.ParseQuery(strings.TrimPrefix(payload.Query, "?"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	token, validToken := exactQueryToken(values, publisherTokenQueryKey)
	if !validToken {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	tokenPayload, err := sessiontoken.ValidateForRoute(
		s.publishToken,
		token,
		sessiontoken.RouteValidation{
			Action: mediaMTXActionPublish, StreamID: parsed.StreamID, StreamPath: payload.Path,
			Now: time.Now(), EnforceExpiry: true,
		},
	)
	if err != nil || !s.validateActivePublishSession(tokenPayload, time.Now()) {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s Server) authorizeMediaMTXPlayback(w http.ResponseWriter, payload mediaMTXAuthRequest) {
	if s.publishToken == "" {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	parsed, err := domain.ParseStreamPath(payload.Path)
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
		return
	}
	values, err := url.ParseQuery(strings.TrimPrefix(payload.Query, "?"))
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
		return
	}
	rawToken, validToken := exactQueryToken(values, playbackTokenQueryKey)
	if !validToken {
		writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
		return
	}
	if parsed.Prefix == "talkback" {
		if !s.validTalkbackPlaybackToken(parsed, rawToken, time.Now()) {
			writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionLookupTimeout)
	defer cancel()
	target, err := s.resolveStreamTarget(ctx, parsed)
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
		return
	}
	if sessiontoken.Validate(
		s.publishToken,
		rawToken,
		mediaMTXActionPlayback,
		parsed.StreamID,
		payload.Path,
		target.PublisherGroupID,
		time.Now(),
	) != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPlaybackAuthFailed))
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s Server) validTalkbackPlaybackToken(parsed domain.ParsedStreamPath, rawToken string, now time.Time) bool {
	token, err := sessiontoken.ValidateForRoute(
		s.publishToken,
		rawToken,
		sessiontoken.RouteValidation{
			Action: mediaMTXActionPlayback, StreamID: parsed.StreamID, StreamPath: parsed.Path,
			Now: now, EnforceExpiry: true,
		},
	)
	return err == nil && s.talkbackPlaybackTokenIsActive(token, now)
}

func exactQueryToken(values url.Values, key string) (string, bool) {
	tokens, found := values[key]
	if !found || len(tokens) != 1 || strings.TrimSpace(tokens[0]) == "" {
		return "", false
	}
	return tokens[0], true
}

func (s Server) talkbackPlaybackTokenIsActive(token sessiontoken.Payload, now time.Time) bool {
	if token.SessionID != "" {
		return s.validateActivePublishSession(token, now)
	}
	return s.legacyTokenHasActiveScope(token)
}
