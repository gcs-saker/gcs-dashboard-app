package httpapi

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const cameraCommandTTL = 30 * time.Second

type cameraCommand struct {
	FacingMode string    `json:"facingMode"`
	Revision   uint64    `json:"revision"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type cameraCommandStore struct {
	mu       sync.RWMutex
	commands map[string]cameraCommand
}

func newCameraCommandStore() *cameraCommandStore {
	return &cameraCommandStore{commands: make(map[string]cameraCommand)}
}

func (s *cameraCommandStore) read(streamID string) cameraCommand {
	s.mu.Lock()
	defer s.mu.Unlock()
	command := s.commands[streamID]
	if !command.UpdatedAt.IsZero() && time.Since(command.UpdatedAt) > cameraCommandTTL {
		delete(s.commands, streamID)
		return cameraCommand{}
	}
	return command
}

func (s *cameraCommandStore) update(streamID, facingMode string) cameraCommand {
	s.mu.Lock()
	defer s.mu.Unlock()
	command := s.commands[streamID]
	command.FacingMode = facingMode
	command.Revision++
	command.UpdatedAt = time.Now().UTC()
	s.commands[streamID] = command
	return command
}

func (s Server) writeDashboardCameraControl(w http.ResponseWriter, r *http.Request, streamID string) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil || parsed.Prefix != "raw" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload("camera control target must be a raw stream"))
		return
	}
	if r.Method == http.MethodGet {
		s.readCameraControl(w, r, parsed)
		return
	}
	if r.Method == http.MethodPost {
		s.updateCameraControl(w, r, parsed)
		return
	}
	w.Header().Set("Allow", "GET, POST")
	writeJSON(w, http.StatusMethodNotAllowed, errorPayload("camera control method is not supported"))
}

func (s Server) readCameraControl(w http.ResponseWriter, r *http.Request, parsed domain.ParsedStreamPath) {
	if err := s.requireStreamAccess(r.Context(), r.Header.Get(authorizationHeader), parsed); err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, s.cameras.read(parsed.StreamID))
}

func (s Server) updateCameraControl(w http.ResponseWriter, r *http.Request, parsed domain.ParsedStreamPath) {
	stream, found, err := s.findStream(r.Context(), parsed.StreamID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(errStreamRegistryQueryFailed))
		return
	}
	if !found || !stream.Ready || stream.Status != domain.StreamStatusOnline {
		writeJSON(w, http.StatusConflict, errorPayload("camera control target is not actively publishing"))
		return
	}
	if err := s.requireTalkbackSendAccess(r.Context(), r.Header.Get(authorizationHeader), parsed); err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	var request struct{ FacingMode string `json:"facingMode"` }
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&request) != nil || (request.FacingMode != "front" && request.FacingMode != "rear") {
		writeJSON(w, http.StatusBadRequest, errorPayload("facingMode must be front or rear"))
		return
	}
	writeJSON(w, http.StatusOK, s.cameras.update(parsed.StreamID, request.FacingMode))
}
