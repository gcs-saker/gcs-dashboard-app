package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type StreamLister interface {
	ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error)
}

type IceServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type Server struct {
	streams  StreamLister
	ice      IceServerProvider
	playback domain.PlaybackURLBuilder
}

func NewServer(streams StreamLister, ice IceServerProvider, playback domain.PlaybackURLBuilder) Server {
	return Server{streams: streams, ice: ice, playback: playback}
}

func (s Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.healthz)
	mux.HandleFunc("/v1/streams", s.streamList)
	mux.HandleFunc("/v1/ice-servers", s.iceServers)
	mux.HandleFunc("/api/v1/streams/ice-servers", s.dashboardIceServers)
	mux.HandleFunc("/api/v1/streams/", s.dashboardStreamItem)
	mux.HandleFunc("/api/v1/streams", s.dashboardStreamList)
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

func (s Server) dashboardStreamList(w http.ResponseWriter, r *http.Request) {
	streams, err := s.streams.ListStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"detail": err.Error()})
		return
	}

	payload := make([]streamDescriptorResponse, 0, len(streams))
	for _, stream := range streams {
		item, err := s.streamDescriptorResponse(stream)
		if err != nil {
			continue
		}
		payload = append(payload, item)
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s Server) dashboardStreamItem(w http.ResponseWriter, r *http.Request) {
	streamID, suffix, ok := streamIDAndSuffix(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if _, err := domain.ParseStreamID(streamID); err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
		return
	}

	stream, found, err := s.findStream(r.Context(), streamID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"detail": err.Error()})
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"detail": "stream is not registered"})
		return
	}

	switch suffix {
	case "":
		payload, err := s.streamDescriptorResponse(stream)
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, payload)
	case "playback":
		payload, err := s.streamPlaybackResponse(stream)
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, payload)
	case "status":
		parsed, err := domain.ParseStreamPath(string(stream.Path))
		if err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, streamStatusResponse{StreamID: parsed.StreamID, Status: stream.Status})
	default:
		http.NotFound(w, r)
	}
}

func (s Server) dashboardIceServers(w http.ResponseWriter, _ *http.Request) {
	servers := s.ice.HealthyIceServers()
	payload := make([]iceServerResponse, 0, len(servers))
	for _, server := range servers {
		payload = append(payload, iceServerResponse{
			URLs:       server.URL,
			Username:   emptyAsNil(server.Username),
			Credential: emptyAsNil(server.Credential),
		})
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s Server) findStream(ctx context.Context, streamID string) (domain.StreamDescriptor, bool, error) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}

	streams, err := s.streams.ListStreams(ctx)
	if err != nil {
		return domain.StreamDescriptor{}, false, err
	}
	for _, stream := range streams {
		streamPath, err := domain.ParseStreamPath(string(stream.Path))
		if err != nil {
			continue
		}
		if streamPath.StreamID == parsed.StreamID {
			return stream, true, nil
		}
	}
	return domain.StreamDescriptor{}, false, nil
}

func (s Server) streamDescriptorResponse(stream domain.StreamDescriptor) (streamDescriptorResponse, error) {
	parsed, err := domain.ParseStreamPath(string(stream.Path))
	if err != nil {
		return streamDescriptorResponse{}, err
	}
	playbackURLs := s.playback.Build(parsed)
	return streamDescriptorResponse{
		StreamID:     parsed.StreamID,
		Path:         parsed.Path,
		Prefix:       parsed.Prefix,
		AssetID:      parsed.AssetID,
		SensorID:     parsed.SensorID,
		ProcessorID:  emptyAsNil(parsed.ProcessorID),
		Date:         emptyAsNil(parsed.ArchiveDate),
		Status:       stream.Status,
		DisplayName:  emptyAsNil(displayName(stream, parsed)),
		PlaybackURLs: playbackURLs,
	}, nil
}

func (s Server) streamPlaybackResponse(stream domain.StreamDescriptor) (streamPlaybackResponse, error) {
	descriptor, err := s.streamDescriptorResponse(stream)
	if err != nil {
		return streamPlaybackResponse{}, err
	}
	return streamPlaybackResponse{
		StreamID:     descriptor.StreamID,
		Status:       descriptor.Status,
		PlaybackURLs: descriptor.PlaybackURLs,
	}, nil
}

func streamIDAndSuffix(path string) (string, string, bool) {
	trimmed := strings.TrimPrefix(path, "/api/v1/streams/")
	if trimmed == path || trimmed == "" {
		return "", "", false
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) > 2 {
		return "", "", false
	}
	suffix := ""
	if len(parts) == 2 {
		suffix = parts[1]
	}
	return parts[0], suffix, true
}

func displayName(stream domain.StreamDescriptor, parsed domain.ParsedStreamPath) string {
	if stream.Source == "" {
		return parsed.StreamID
	}
	return parsed.StreamID + " (" + stream.Source + ", readers " + strconv.Itoa(stream.ReaderCount) + ")"
}

func emptyAsNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

type streamDescriptorResponse struct {
	StreamID     string              `json:"streamId"`
	Path         string              `json:"path"`
	Prefix       string              `json:"prefix"`
	AssetID      string              `json:"assetId"`
	SensorID     string              `json:"sensorId"`
	ProcessorID  *string             `json:"processorId"`
	Date         *string             `json:"date"`
	Status       domain.StreamStatus `json:"status"`
	DisplayName  *string             `json:"displayName"`
	PlaybackURLs domain.PlaybackURLs `json:"playbackUrls"`
}

type streamPlaybackResponse struct {
	StreamID     string              `json:"streamId"`
	Status       domain.StreamStatus `json:"status"`
	PlaybackURLs domain.PlaybackURLs `json:"playbackUrls"`
}

type streamStatusResponse struct {
	StreamID string              `json:"streamId"`
	Status   domain.StreamStatus `json:"status"`
}

type iceServerResponse struct {
	URLs       string  `json:"urls"`
	Username   *string `json:"username"`
	Credential *string `json:"credential"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
