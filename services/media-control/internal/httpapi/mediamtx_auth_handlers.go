package httpapi

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func (s Server) mediaMTXAuth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var payload mediaMTXAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, errorPayload(errPublisherAuthFailed))
		return
	}
	switch payload.Action {
	case mediaMTXActionPublish:
		s.authorizeMediaMTXPublish(w, payload)
	case mediaMTXActionRead, mediaMTXActionPlayback:
		s.authorizeMediaMTXPlayback(w, payload)
	default:
		w.WriteHeader(http.StatusNoContent)
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
	target := s.groups.TargetFor(parsed)
	values, err := url.ParseQuery(strings.TrimPrefix(payload.Query, "?"))
	if err != nil || validateMediaToken(
		s.publishToken,
		values.Get(publisherTokenQueryKey),
		mediaMTXActionPublish,
		parsed.StreamID,
		payload.Path,
		target.PublisherGroupID,
		time.Now(),
	) != nil {
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
	target := s.groups.TargetFor(parsed)
	values, err := url.ParseQuery(strings.TrimPrefix(payload.Query, "?"))
	if err != nil || validateMediaToken(
		s.publishToken,
		values.Get(playbackTokenQueryKey),
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
