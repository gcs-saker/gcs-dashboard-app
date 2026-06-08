package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const (
	routeHealthz                     = "/healthz"
	routeReadyz                      = "/readyz"
	routeStreams                     = "/v1/streams"
	routeIceServers                  = "/v1/ice-servers"
	routeLegacyStreamStatus          = "/stream/status"
	routeDashboardIceServers         = "/api/v1/streams/ice-servers"
	routeDashboardStreamItemPrefix   = "/api/v1/streams/"
	routeDashboardStreams            = "/api/v1/streams"
	routeSuffixPlayback              = "playback"
	routeSuffixStatus                = "status"
	contentTypeHeader                = "Content-Type"
	jsonContentType                  = "application/json"
	authorizationHeader              = "Authorization"
	deprecationHeader                = "Deprecation"
	jsonKeyDetail                    = "detail"
	jsonKeyDeprecated                = "deprecated"
	jsonKeyChecks                    = "checks"
	jsonKeyIceServers                = "iceServers"
	jsonKeyName                      = "name"
	jsonKeyReason                    = "reason"
	jsonKeyRequired                  = "required"
	jsonKeyReplacement               = "replacement"
	jsonKeyService                   = "service"
	jsonKeyStatus                    = "status"
	jsonKeyStream                    = "stream"
	jsonKeyStreams                   = "streams"
	mediaControlServiceName          = "media-control"
	healthStatusOK                   = "ok"
	healthStatusDegraded             = "degraded"
	healthStatusError                = "error"
	legacyStreamReadyStatus          = "ready"
	legacyStreamStatusReplacement    = "/media-control/api/v1/streams"
	legacyStreamStatusDeprecatedFlag = "true"
	replacementRouteHeader           = "X-GCS-Replacement-Route"
	readyCheckStreamRegistry         = "stream_registry"
	readyCheckIceServers             = "ice_servers"
	errStreamRegistryQueryFailed     = "stream registry query failed"
	errNoHealthyIceServers           = "no healthy ICE servers available"
	errAuthenticationRequiredMessage = "authentication required"
	errStreamAccessDeniedMessage     = "stream access denied"
	errStreamNotRegisteredMessage    = "stream is not registered"
)

type StreamLister interface {
	ListStreams(ctx context.Context) ([]domain.StreamDescriptor, error)
}

type IceServerProvider interface {
	HealthyIceServers() []domain.IceServer
}

type StreamAuthorizer interface {
	AuthorizeStream(
		ctx context.Context,
		authorization string,
		target domain.StreamAccessTarget,
	) (domain.StreamAccessDecision, error)
}

type Server struct {
	streams    StreamLister
	ice        IceServerProvider
	playback   domain.PlaybackURLBuilder
	authorizer StreamAuthorizer
	groups     domain.StreamGroupResolver
}

func NewServer(
	streams StreamLister,
	ice IceServerProvider,
	playback domain.PlaybackURLBuilder,
	authorizer StreamAuthorizer,
	groups domain.StreamGroupResolver,
) Server {
	return Server{streams: streams, ice: ice, playback: playback, authorizer: authorizer, groups: groups}
}

func (s Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc(routeHealthz, s.healthz)
	mux.HandleFunc(routeReadyz, s.readyz)
	mux.HandleFunc(routeStreams, s.streamList)
	mux.HandleFunc(routeIceServers, s.iceServers)
	mux.HandleFunc(routeLegacyStreamStatus, s.legacyStreamStatus)
	mux.HandleFunc(routeDashboardIceServers, s.dashboardIceServers)
	mux.HandleFunc(routeDashboardStreamItemPrefix, s.dashboardStreamItem)
	mux.HandleFunc(routeDashboardStreams, s.dashboardStreamList)
	return mux
}

func (s Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		jsonKeyStatus:  healthStatusOK,
		jsonKeyService: mediaControlServiceName,
	})
}

func (s Server) readyz(w http.ResponseWriter, r *http.Request) {
	checks := []readinessCheck{
		s.streamRegistryReadiness(r.Context()),
		s.iceServerReadiness(),
	}
	status := healthStatusOK
	httpStatus := http.StatusOK
	for _, check := range checks {
		if check.Status == healthStatusError && check.Required {
			status = healthStatusDegraded
			httpStatus = http.StatusServiceUnavailable
			break
		}
	}
	writeJSON(w, httpStatus, map[string]any{
		jsonKeyService: mediaControlServiceName,
		jsonKeyStatus:  status,
		jsonKeyChecks:  checks,
	})
}

func (s Server) streamRegistryReadiness(ctx context.Context) readinessCheck {
	if _, err := s.streams.ListStreams(ctx); err != nil {
		return readinessCheck{
			Name:     readyCheckStreamRegistry,
			Status:   healthStatusError,
			Required: true,
			Reason:   errStreamRegistryQueryFailed,
		}
	}
	return readinessCheck{Name: readyCheckStreamRegistry, Status: healthStatusOK, Required: true}
}

func (s Server) iceServerReadiness() readinessCheck {
	if len(s.ice.HealthyIceServers()) == 0 {
		return readinessCheck{
			Name:     readyCheckIceServers,
			Status:   healthStatusError,
			Required: true,
			Reason:   errNoHealthyIceServers,
		}
	}
	return readinessCheck{Name: readyCheckIceServers, Status: healthStatusOK, Required: true}
}

func (s Server) streamList(w http.ResponseWriter, r *http.Request) {
	streams, err := s.streams.ListStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{jsonKeyStreams: streams})
}

func (s Server) legacyStreamStatus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set(deprecationHeader, legacyStreamStatusDeprecatedFlag)
	w.Header().Set(replacementRouteHeader, legacyStreamStatusReplacement)
	writeJSON(w, http.StatusOK, map[string]any{
		jsonKeyStream:      legacyStreamReadyStatus,
		jsonKeyService:     mediaControlServiceName,
		jsonKeyStatus:      healthStatusOK,
		jsonKeyDeprecated:  true,
		jsonKeyReplacement: legacyStreamStatusReplacement,
	})
}

func (s Server) iceServers(w http.ResponseWriter, r *http.Request) {
	_, err := s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.IceServersTarget())
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{jsonKeyIceServers: s.ice.HealthyIceServers()})
}

func (s Server) dashboardStreamList(w http.ResponseWriter, r *http.Request) {
	streams, err := s.streams.ListStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(err.Error()))
		return
	}

	payload := make([]streamDescriptorResponse, 0, len(streams))
	for _, stream := range streams {
		parsed, err := domain.ParseStreamPath(string(stream.Path))
		if err != nil {
			continue
		}
		_, err = s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.TargetFor(parsed))
		if errors.Is(err, domain.ErrStreamAuthenticationRequired) {
			writeJSON(w, http.StatusUnauthorized, errorPayload(errAuthenticationRequiredMessage))
			return
		}
		if errors.Is(err, domain.ErrStreamAccessDenied) {
			continue
		}
		if err != nil {
			writeJSON(w, http.StatusBadGateway, errorPayload(err.Error()))
			return
		}
		item := s.streamDescriptorResponseFromParsed(stream, parsed)
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
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload(err.Error()))
		return
	}

	stream, found, err := s.findStream(r.Context(), streamID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(err.Error()))
		return
	}
	if !found {
		writeJSON(w, http.StatusNotFound, errorPayload(errStreamNotRegisteredMessage))
		return
	}
	parsed, err := s.authorizeDashboardStream(r.Context(), r.Header.Get(authorizationHeader), stream)
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}

	switch suffix {
	case "":
		writeJSON(w, http.StatusOK, s.streamDescriptorResponseFromParsed(stream, parsed))
	case routeSuffixPlayback:
		writeJSON(w, http.StatusOK, s.streamPlaybackResponseFromParsed(stream, parsed))
	case routeSuffixStatus:
		writeJSON(w, http.StatusOK, streamStatusResponse{StreamID: parsed.StreamID, Status: stream.Status})
	default:
		http.NotFound(w, r)
	}
}

func (s Server) dashboardIceServers(w http.ResponseWriter, r *http.Request) {
	_, err := s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.IceServersTarget())
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}

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
	return s.streamDescriptorResponseFromParsed(stream, parsed), nil
}

func (s Server) streamDescriptorResponseFromParsed(
	stream domain.StreamDescriptor,
	parsed domain.ParsedStreamPath,
) streamDescriptorResponse {
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
	}
}

func (s Server) streamPlaybackResponse(stream domain.StreamDescriptor) (streamPlaybackResponse, error) {
	parsed, err := domain.ParseStreamPath(string(stream.Path))
	if err != nil {
		return streamPlaybackResponse{}, err
	}
	return s.streamPlaybackResponseFromParsed(stream, parsed), nil
}

func (s Server) streamPlaybackResponseFromParsed(
	stream domain.StreamDescriptor,
	parsed domain.ParsedStreamPath,
) streamPlaybackResponse {
	descriptor := s.streamDescriptorResponseFromParsed(stream, parsed)
	return streamPlaybackResponse{
		StreamID:     descriptor.StreamID,
		Status:       descriptor.Status,
		PlaybackURLs: descriptor.PlaybackURLs,
	}
}

func (s Server) authorizeDashboardStream(
	ctx context.Context,
	authorization string,
	stream domain.StreamDescriptor,
) (domain.ParsedStreamPath, error) {
	parsed, err := domain.ParseStreamPath(string(stream.Path))
	if err != nil {
		return domain.ParsedStreamPath{}, err
	}
	_, err = s.authorizer.AuthorizeStream(ctx, authorization, s.groups.TargetFor(parsed))
	return parsed, err
}

func (s Server) writeStreamAccessError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrStreamAuthenticationRequired):
		writeJSON(w, http.StatusUnauthorized, errorPayload(errAuthenticationRequiredMessage))
	case errors.Is(err, domain.ErrStreamAccessDenied):
		writeJSON(w, http.StatusForbidden, errorPayload(errStreamAccessDeniedMessage))
	default:
		writeJSON(w, http.StatusBadGateway, errorPayload(err.Error()))
	}
}

func streamIDAndSuffix(path string) (string, string, bool) {
	trimmed := strings.TrimPrefix(path, routeDashboardStreamItemPrefix)
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

type readinessCheck struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	Required bool   `json:"required"`
	Reason   string `json:"reason,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set(contentTypeHeader, jsonContentType)
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorPayload(detail string) map[string]string {
	return map[string]string{jsonKeyDetail: detail}
}
