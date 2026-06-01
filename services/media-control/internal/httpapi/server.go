package httpapi

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type StreamLister interface {
	ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error)
}

type IceServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type Server struct {
	streams StreamLister
	ice     IceServerProvider
}

func NewServer(streams StreamLister, ice IceServerProvider) Server {
	return Server{streams: streams, ice: ice}
}

func (s Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/v1/streams", s.streamList)
	mux.HandleFunc("/v1/ice-servers", s.iceServers)
	return mux
}

func (s Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "media-control",
	})
}

func (s Server) streamList(w http.ResponseWriter, r *http.Request) {
	streams, err := s.streams.ListStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"streams": streams})
}

func (s Server) iceServers(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"iceServers": s.ice.HealthyIceServers()})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
