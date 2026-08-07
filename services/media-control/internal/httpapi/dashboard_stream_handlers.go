package httpapi

import (
	"net/http"
	"strings"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func (s Server) dashboardStreamItem(w http.ResponseWriter, r *http.Request) {
	route, ok := dashboardStreamRouteFromPath(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if route.suffix == routeSuffixPublish {
		s.writeDashboardStreamPublish(w, r, route.streamID)
		return
	}
	if route.suffix == "talkback-publish" {
		s.writeDashboardTalkbackPublish(w, r, route.streamID)
		return
	}
	if route.suffix == "talkback-playback" {
		s.writeDashboardTalkbackPlayback(w, r, route.streamID)
		return
	}
	s.writeDashboardStreamRead(w, r, route.streamID, route.suffix)
}

func (s Server) writeDashboardTalkbackPlayback(w http.ResponseWriter, r *http.Request, streamID string) {
	parsed, talkback, publisherGroupID, ok := s.authorizeTalkbackRoute(w, r, streamID)
	if !ok {
		return
	}
	_ = parsed
	playbackURLs := s.withPlaybackTokenForGroup(s.playback.Build(talkback), talkback, publisherGroupID)
	writeJSON(w, http.StatusOK, streamPlaybackResponse{
		StreamID: talkback.StreamID, Status: domain.StreamStatusOnline, PlaybackURLs: playbackURLs,
	})
}

func (s Server) writeDashboardTalkbackPublish(w http.ResponseWriter, r *http.Request, streamID string) {
	_, talkback, publisherGroupID, ok := s.authorizeTalkbackRoute(w, r, streamID)
	if !ok {
		return
	}
	s.writeStreamPublishResponseForGroup(w, talkback, publisherGroupID)
}

func (s Server) authorizeTalkbackRoute(w http.ResponseWriter, r *http.Request, streamID string) (domain.ParsedStreamPath, domain.ParsedStreamPath, string, bool) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil || parsed.Prefix != "raw" {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload("talkback target must be a raw stream"))
		return domain.ParsedStreamPath{}, domain.ParsedStreamPath{}, "", false
	}
	if err := s.requireStreamAccess(r.Context(), r.Header.Get(authorizationHeader), parsed); err != nil {
		s.writeStreamAccessError(w, err)
		return domain.ParsedStreamPath{}, domain.ParsedStreamPath{}, "", false
	}
	operatorID := strings.TrimSpace(r.URL.Query().Get("operatorId"))
	if operatorID == "" {
		operatorID = "operator"
	}
	talkback, err := domain.ParseStreamPath("talkback/" + parsed.Path + "/" + operatorID)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload("operator id is invalid"))
		return domain.ParsedStreamPath{}, domain.ParsedStreamPath{}, "", false
	}
	return parsed, talkback, s.groups.TargetFor(parsed).PublisherGroupID, true
}

func (s Server) writeDashboardStreamPublish(w http.ResponseWriter, r *http.Request, streamID string) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload(err.Error()))
		return
	}
	if requestHasDeviceCredential(r) {
		s.writeDeviceStreamPublish(w, r, parsed)
		return
	}
	if err := s.requireStreamAccess(r.Context(), r.Header.Get(authorizationHeader), parsed); err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	s.writeStreamPublishResponse(w, parsed)
}

func (s Server) writeDeviceStreamPublish(w http.ResponseWriter, r *http.Request, parsed domain.ParsedStreamPath) {
	if s.devicePublisher == nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	command := domain.DevicePublishCommand{
		DeviceUUID: strings.TrimSpace(r.Header.Get(deviceUUIDHeader)),
		Credential: strings.TrimSpace(r.Header.Get(deviceCredentialHeader)),
		SensorID:   parsed.SensorID,
	}
	if command.DeviceUUID == "" || command.Credential == "" {
		writeJSON(w, http.StatusUnauthorized, errorPayload(errDevicePublisherAuthRequired))
		return
	}
	authorization, err := s.devicePublisher.AuthorizeDevicePublish(r.Context(), command)
	if err != nil {
		writeJSON(w, http.StatusForbidden, errorPayload(errPublisherAuthFailed))
		return
	}
	s.writeStreamPublishResponseForGroup(w, parsed, authorization.PublisherGroupID)
}

func requestHasDeviceCredential(r *http.Request) bool {
	return strings.TrimSpace(r.Header.Get(deviceUUIDHeader)) != "" ||
		strings.TrimSpace(r.Header.Get(deviceCredentialHeader)) != ""
}

func (s Server) writeDashboardStreamRead(w http.ResponseWriter, r *http.Request, streamID string, suffix string) {
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
	s.writeDashboardStreamSuffix(w, r, stream, parsed, suffix)
}

func (s Server) writeDashboardStreamSuffix(
	w http.ResponseWriter,
	r *http.Request,
	stream domain.StreamDescriptor,
	parsed domain.ParsedStreamPath,
	suffix string,
) {
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
