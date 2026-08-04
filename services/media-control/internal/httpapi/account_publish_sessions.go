package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func (s Server) accountPublishSessions(w http.ResponseWriter, r *http.Request) {
	if s.accountPublisher == nil || s.publishSessions == nil || strings.TrimSpace(s.publishToken) == "" {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	if r.URL.Path == routeAccountPublishSessions {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		s.createAccountPublishSession(w, r)
		return
	}
	trimmed := strings.TrimPrefix(r.URL.Path, routeAccountPublishSessionPrefix)
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 2 && parts[1] == "renew" && r.Method == http.MethodPost {
		s.renewDevicePublishSession(w, r, parts[0])
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.endDevicePublishSession(w, r, parts[0])
		return
	}
	http.NotFound(w, r)
}

func (s Server) createAccountPublishSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, private")
	authorizationHeaderValue := strings.TrimSpace(r.Header.Get(authorizationHeader))
	if bearerToken(authorizationHeaderValue) == "" {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errAuthenticationRequiredMessage))
		return
	}
	defer r.Body.Close()
	var request createPublishSessionRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil && !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, errorPayload(errPublishSessionInvalid))
		return
	}
	authorization, err := s.accountPublisher.AuthorizeAccountPublish(r.Context(), domain.AccountPublishCommand{
		Authorization: authorizationHeaderValue,
		SensorID:      strings.TrimSpace(request.SensorID),
	})
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	s.issuePublishSession(w, r, authorization, authorization.DeviceUUID)
}
