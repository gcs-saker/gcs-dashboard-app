package httpapi

import (
	"net/http"

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
	s.writeDashboardStreamRead(w, r, route.streamID, route.suffix)
}

func (s Server) writeDashboardStreamPublish(w http.ResponseWriter, r *http.Request, streamID string) {
	parsed, err := domain.ParseStreamID(streamID)
	if err != nil {
		writeJSON(w, http.StatusUnprocessableEntity, errorPayload(err.Error()))
		return
	}
	if err := s.requireStreamAccess(r.Context(), r.Header.Get(authorizationHeader), parsed); err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	s.writeStreamPublishResponse(w, parsed)
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
