package httpapi

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/sessiontoken"
)

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
	return streamDescriptorResponse{
		StreamID:    parsed.StreamID,
		AssetID:     parsed.AssetID,
		SensorID:    parsed.SensorID,
		Status:      stream.Status,
		DisplayName: nil,
	}
}

func (s Server) streamPlaybackResponse(stream domain.StreamDescriptor) (streamPlaybackResponse, error) {
	parsed, err := domain.ParseStreamPath(string(stream.Path))
	if err != nil {
		return streamPlaybackResponse{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), sessionLookupTimeout)
	defer cancel()
	return s.streamPlaybackResponseFromParsed(ctx, stream, parsed)
}

func (s Server) streamPlaybackResponseFromParsed(
	ctx context.Context,
	stream domain.StreamDescriptor,
	parsed domain.ParsedStreamPath,
) (streamPlaybackResponse, error) {
	target, err := s.resolveStreamTarget(ctx, parsed)
	if err != nil {
		return streamPlaybackResponse{}, err
	}
	playbackURLs := s.withPlaybackTokenForGroup(s.playback.Build(parsed), parsed, target.PublisherGroupID)
	return streamPlaybackResponse{
		StreamID:     parsed.StreamID,
		Status:       stream.Status,
		PlaybackURLs: playbackURLs,
	}, nil
}

func (s Server) writeStreamPublishResponse(w http.ResponseWriter, r *http.Request, parsed domain.ParsedStreamPath) {
	target, err := s.resolveStreamTarget(r.Context(), parsed)
	if err != nil {
		s.writeStreamAccessError(w, err)
		return
	}
	s.writeStreamPublishResponseForGroup(w, parsed, target.PublisherGroupID)
}

func (s Server) writeStreamPublishResponseForGroup(
	w http.ResponseWriter,
	parsed domain.ParsedStreamPath,
	publisherGroupID string,
) {
	if s.publishToken == "" {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	playbackURLs := s.playback.Build(parsed)
	token, err := sessiontoken.Issue(
		s.publishToken,
		mediaMTXActionPublish,
		parsed.StreamID,
		parsed.Path,
		publisherGroupID,
		time.Now(),
	)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, errorPayload(errPublisherAuthNotConfigured))
		return
	}
	whipURL := strings.TrimSuffix(playbackURLs.WebRTC, "/whep") + "/whip?" + publisherTokenQueryKey + "=" + url.QueryEscape(token)
	writeJSON(w, http.StatusOK, streamPublishResponse{
		StreamID:   parsed.StreamID,
		WhipURL:    whipURL,
		IceServers: s.iceServerResponses(),
	})
}

func (s Server) iceServerResponses() []iceServerResponse {
	servers := s.healthyIceServers()
	payload := make([]iceServerResponse, 0, len(servers))
	for _, server := range servers {
		payload = append(payload, iceServerResponse{
			URLs:       server.URL,
			Username:   emptyAsNil(server.Username),
			Credential: emptyAsNil(server.Credential),
		})
	}
	return payload
}

func (s Server) withPlaybackTokenForGroup(playbackURLs domain.PlaybackURLs, parsed domain.ParsedStreamPath, publisherGroupID string) domain.PlaybackURLs {
	if s.publishToken == "" {
		return playbackURLs
	}
	token, err := sessiontoken.Issue(
		s.publishToken,
		mediaMTXActionPlayback,
		parsed.StreamID,
		parsed.Path,
		publisherGroupID,
		time.Now(),
	)
	if err != nil {
		return playbackURLs
	}
	return domain.PlaybackURLs{
		WebRTC: appendQueryToken(playbackURLs.WebRTC, playbackTokenQueryKey, token),
		HLS:    appendQueryToken(playbackURLs.HLS, playbackTokenQueryKey, token),
	}
}

func appendQueryToken(rawURL string, key string, token string) string {
	if rawURL == "" || token == "" {
		return rawURL
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	values := parsed.Query()
	values.Set(key, token)
	parsed.RawQuery = values.Encode()
	return parsed.String()
}

func emptyAsNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
