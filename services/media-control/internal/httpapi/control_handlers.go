package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

var (
	ErrControlDenied      = errors.New("control_denied")
	ErrControlConflict    = errors.New("control_conflict")
	ErrControlUnavailable = errors.New("control_unavailable")
)

type ControlSessionRequest struct {
	DeviceID       string `json:"deviceId"`
	PublishSession string `json:"publishSessionId"`
}

type ControlSessionResponse struct {
	ControlSessionID string `json:"controlSessionId"`
	ExpiresAt        string `json:"expiresAt"`
	HeartbeatMillis  int    `json:"heartbeatIntervalMillis"`
}

type ControlCommandRequest struct {
	Command       string  `json:"command"`
	Sequence      uint64  `json:"sequence"`
	IdempotencyID string  `json:"idempotencyId"`
	Forward       float64 `json:"forward,omitempty"`
	Right         float64 `json:"right,omitempty"`
}

type ControlCommandResponse struct {
	CommandID string `json:"commandId"`
	Status    string `json:"status"`
}

func (s Server) controlSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSON(w, http.StatusMethodNotAllowed, errorPayload("method not allowed"))
		return
	}
	if s.control == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(ErrControlUnavailable.Error()))
		return
	}
	authorization := strings.TrimSpace(r.Header.Get(authorizationHeader))
	if authorization == "" {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errAuthenticationRequiredMessage))
		return
	}
	segments := strings.Split(strings.TrimPrefix(r.URL.Path, routeControlSessionPrefix), "/")
	if r.URL.Path == routeControlSessions {
		s.createControlSession(w, r, authorization)
		return
	}
	if len(segments) == 2 && segments[0] != "" && segments[1] == "commands" {
		s.submitControlCommand(w, r, authorization, segments[0])
		return
	}
	writeJSON(w, http.StatusNotFound, errorPayload("control route not found"))
}

func (s Server) createControlSession(w http.ResponseWriter, r *http.Request, authorization string) {
	var request ControlSessionRequest
	if decodeJSONBody(r, &request) != nil || request.DeviceID == "" || request.PublishSession == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload("control session request is invalid"))
		return
	}
	response, err := s.control.CreateSession(r.Context(), authorization, request)
	writeControlResult(w, http.StatusCreated, response, err)
}

func (s Server) submitControlCommand(w http.ResponseWriter, r *http.Request, authorization, sessionID string) {
	var request ControlCommandRequest
	if decodeJSONBody(r, &request) != nil || request.Command == "" || request.Sequence == 0 || request.IdempotencyID == "" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload("control command is invalid"))
		return
	}
	response, err := s.control.SubmitCommand(r.Context(), authorization, sessionID, request)
	writeControlResult(w, http.StatusAccepted, response, err)
}

func writeControlResult(w http.ResponseWriter, success int, payload any, err error) {
	if err == nil {
		writeJSON(w, success, payload)
		return
	}
	status := http.StatusServiceUnavailable
	if errors.Is(err, ErrControlDenied) {
		status = http.StatusForbidden
	}
	if errors.Is(err, ErrControlConflict) {
		status = http.StatusConflict
	}
	writeJSON(w, status, errorPayload(err.Error()))
}

func decodeJSONBody(r *http.Request, target any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 16*1024))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}
