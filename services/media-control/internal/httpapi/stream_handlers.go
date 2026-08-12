package httpapi

import (
	"net/http"
)

func (s Server) streamList(w http.ResponseWriter, r *http.Request) {
	streams, err := s.listStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(errStreamRegistryQueryFailed))
		return
	}
	writeJSON(w, http.StatusOK, streamListResponse{Streams: streams})
}

func (s Server) legacyStreamStatus(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set(deprecationHeader, legacyStreamStatusDeprecatedFlag)
	w.Header().Set(replacementRouteHeader, legacyStreamStatusReplacement)
	writeJSON(w, http.StatusOK, legacyStreamStatusResponse{
		Stream:      legacyStreamReadyStatus,
		Service:     mediaControlServiceName,
		Status:      healthStatusOK,
		Deprecated:  true,
		Replacement: legacyStreamStatusReplacement,
	})
}

func (s Server) iceServers(w http.ResponseWriter, r *http.Request) {
	_, err := s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.IceServersTarget())
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, iceServersResponse{IceServers: s.healthyIceServers()})
}

func (s Server) dashboardStreamList(w http.ResponseWriter, r *http.Request) {
	if _, err := s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.StreamListTarget()); err != nil {
		s.writeStreamAccessError(w, err)
		return
	}

	streams, err := s.listStreams(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, errorPayload(errStreamRegistryQueryFailed))
		return
	}

	payload, err := s.authorizedStreamListResponse(r, streams)
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s Server) dashboardIceServers(w http.ResponseWriter, r *http.Request) {
	_, err := s.authorizer.AuthorizeStream(r.Context(), r.Header.Get(authorizationHeader), s.groups.IceServersTarget())
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, s.iceServerResponses())
}
