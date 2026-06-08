package domain

import (
	"fmt"
	"net/url"
	"strings"
)

type PlaybackURLs struct {
	WebRTC string `json:"webrtc,omitempty"`
	HLS    string `json:"hls,omitempty"`
}

type PlaybackURLBuilder struct {
	PublicWebRTCBaseURL string
	PublicHLSBaseURL    string
}

func NewPlaybackURLBuilder(publicWebRTCBaseURL string, publicHLSBaseURL string) (PlaybackURLBuilder, error) {
	if err := validateOptionalHTTPBaseURL(publicWebRTCBaseURL); err != nil {
		return PlaybackURLBuilder{}, err
	}
	if err := validateOptionalHTTPBaseURL(publicHLSBaseURL); err != nil {
		return PlaybackURLBuilder{}, err
	}
	return PlaybackURLBuilder{
		PublicWebRTCBaseURL: strings.TrimRight(strings.TrimSpace(publicWebRTCBaseURL), "/"),
		PublicHLSBaseURL:    strings.TrimRight(strings.TrimSpace(publicHLSBaseURL), "/"),
	}, nil
}

func (b PlaybackURLBuilder) Build(streamPath ParsedStreamPath) PlaybackURLs {
	return PlaybackURLs{
		WebRTC: joinPlaybackURL(b.PublicWebRTCBaseURL, streamPath.Path, "whep"),
		HLS:    joinPlaybackURL(b.PublicHLSBaseURL, streamPath.Path, "index.m3u8"),
	}
}

func validateOptionalHTTPBaseURL(value string) error {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("playback base URL must be an absolute HTTP(S) URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("playback base URL must be an absolute HTTP(S) URL")
	}
	return nil
}

func joinPlaybackURL(baseURL string, streamPath string, suffix string) string {
	if baseURL == "" {
		return ""
	}
	return fmt.Sprintf("%s/%s/%s", strings.TrimRight(baseURL, "/"), strings.TrimLeft(streamPath, "/"), suffix)
}
