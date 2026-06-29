package httpapi

import (
	"os"
	"strings"
	"testing"
)

func TestAPIDeviceStreamingContractDocumentsMediaControlRoutes(t *testing.T) {
	document, err := os.ReadFile("../../../../docs/api/GCS-Saker_API_Device_Streaming_Contract_v0.1.md")
	if err != nil {
		t.Fatalf("read api contract document: %v", err)
	}
	text := string(document)
	requiredFragments := []string{
		"/media-control" + routeDashboardStreams,
		"/media-control" + routeDashboardStreams + "/{streamId}",
		"/media-control" + routeDashboardStreams + "/{streamId}/" + routeSuffixPlayback,
		"/media-control" + routeDashboardStreams + "/{streamId}/" + routeSuffixPublish,
		"/media-control" + routeDashboardIceServers,
		"/webrtc/{streamPath}/whip",
		"/webrtc/{streamPath}/whep",
		"/hls/{streamPath}/index.m3u8",
		publisherTokenQueryKey,
		playbackTokenQueryKey,
	}

	for _, fragment := range requiredFragments {
		if !strings.Contains(text, fragment) {
			t.Fatalf("API contract document must contain %q", fragment)
		}
	}
}
