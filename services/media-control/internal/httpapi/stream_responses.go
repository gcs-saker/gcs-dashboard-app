package httpapi

import (
	"net/http"
	"net/url"
	"strconv"
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
	playbackURLs := s.playback.Build(parsed)
	playbackURLs = s.withPlaybackToken(playbackURLs, parsed)
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

func (s Server) writeStreamPublishResponse(w http.ResponseWriter, parsed domain.ParsedStreamPath) {
	target := s.groups.TargetFor(parsed)
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

func (s Server) withPlaybackToken(playbackURLs domain.PlaybackURLs, parsed domain.ParsedStreamPath) domain.PlaybackURLs {
	if s.publishToken == "" {
		return playbackURLs
	}
	target := s.groups.TargetFor(parsed)
	return s.withPlaybackTokenForGroup(playbackURLs, parsed, target.PublisherGroupID)
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
