package domain

import "testing"

func TestPlaybackURLBuilderBuildsWHEPAndHLSURLs(t *testing.T) {
	builder, err := NewPlaybackURLBuilder("https://edge.example/webrtc/", "https://edge.example/hls/")
	if err != nil {
		t.Fatal(err)
	}
	streamPath, err := ParseStreamID("raw.local.webcam")
	if err != nil {
		t.Fatal(err)
	}

	urls := builder.Build(streamPath)

	if urls.WebRTC != "https://edge.example/webrtc/raw/local/webcam/whep" {
		t.Fatalf("unexpected webrtc URL %q", urls.WebRTC)
	}
	if urls.HLS != "https://edge.example/hls/raw/local/webcam/index.m3u8" {
		t.Fatalf("unexpected hls URL %q", urls.HLS)
	}
}

func TestPlaybackURLBuilderRejectsNonHTTPBaseURL(t *testing.T) {
	if _, err := NewPlaybackURLBuilder("stun:turn.example:3478", "https://edge.example/hls"); err == nil {
		t.Fatal("expected non-HTTP WebRTC base URL to fail")
	}
}
