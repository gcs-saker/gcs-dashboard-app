package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type streamDescriptorResponse struct {
	StreamID    string              `json:"streamId"`
	AssetID     string              `json:"assetId"`
	SensorID    string              `json:"sensorId"`
	Status      domain.StreamStatus `json:"status"`
	DisplayName *string             `json:"displayName"`
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

type streamPublishResponse struct {
	StreamID   string              `json:"streamId"`
	WhipURL    string              `json:"whipUrl"`
	IceServers []iceServerResponse `json:"iceServers"`
}

type legacyStreamStatusResponse struct {
	Stream      string `json:"stream"`
	Service     string `json:"service"`
	Status      string `json:"status"`
	Deprecated  bool   `json:"deprecated"`
	Replacement string `json:"replacement"`
}

type iceServersResponse struct {
	IceServers []domain.IceServer `json:"iceServers"`
}

type serviceStatusResponse struct {
	Status  string `json:"status"`
	Service string `json:"service"`
}

type readinessResponse struct {
	Service string           `json:"service"`
	Status  string           `json:"status"`
	Checks  []readinessCheck `json:"checks"`
}

type runtimeResponse struct {
	Service string                 `json:"service"`
	Runtime runtimeMetricsResponse `json:"runtime"`
}

type mediaMTXAuthRequest struct {
	User     string `json:"user"`
	Password string `json:"password"`
	IP       string `json:"ip"`
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
	ID       string `json:"id"`
	Query    string `json:"query"`
}

type iceServerResponse struct {
	URLs       string  `json:"urls"`
	Username   *string `json:"username"`
	Credential *string `json:"credential"`
}

type readinessCheck struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Required bool   `json:"required"`
	Reason   string `json:"reason,omitempty"`
}

type runtimeMetricsResponse struct {
	Goroutines       int    `json:"goroutines"`
	HeapAllocBytes   uint64 `json:"heapAllocBytes"`
	HeapInUseBytes   uint64 `json:"heapInUseBytes"`
	NextGCBytes      uint64 `json:"nextGcBytes"`
	PauseTotalNs     uint64 `json:"pauseTotalNs"`
	LastGCUnixNano   uint64 `json:"lastGcUnixNano"`
	MemoryLimitBytes int64  `json:"memoryLimitBytes"`
}

type statusRecordingWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusRecordingWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set(contentTypeHeader, jsonContentType)
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("http_response_encode_failed", "errorCode", "json_encode_failed")
	}
}

func errorPayload(detail string) map[string]string {
	return map[string]string{jsonKeyDetail: detail}
}
