package domain

import "testing"

func TestNewStreamPathRejectsAbsolutePath(t *testing.T) {
	_, err := NewStreamPath("/raw/local/webcam")
	if err == nil {
		t.Fatal("expected absolute stream path to fail")
	}
}

func TestNewStreamPathTrimsWhitespace(t *testing.T) {
	path, err := NewStreamPath(" raw/local/webcam ")
	if err != nil {
		t.Fatal(err)
	}
	if path != StreamPath("raw/local/webcam") {
		t.Fatalf("unexpected stream path %q", path)
	}
}

func TestStreamListDefensivelyCopiesValues(t *testing.T) {
	path, _ := NewStreamPath("raw/local/webcam")
	streams := []StreamDescriptor{{Path: path, Ready: true, Status: StreamStatusOnline}}

	list := NewStreamList(streams)
	streams[0].Status = StreamStatusOffline
	values := list.Values()
	values[0].Status = StreamStatusOffline

	if list.Values()[0].Status != StreamStatusOnline {
		t.Fatalf("expected stream list to protect internal values")
	}
}

func TestParseStreamIDMatchesDashboardContract(t *testing.T) {
	parsed, err := ParseStreamID("raw.local.webcam")
	if err != nil {
		t.Fatal(err)
	}

	if parsed.Path != "raw/local/webcam" {
		t.Fatalf("unexpected path %q", parsed.Path)
	}
	if parsed.StreamID != "raw.local.webcam" {
		t.Fatalf("unexpected stream ID %q", parsed.StreamID)
	}
	if parsed.Prefix != "raw" || parsed.AssetID != "local" || parsed.SensorID != "webcam" {
		t.Fatalf("unexpected parsed route %#v", parsed)
	}
}

func TestParseStreamPathSupportsAIAndArchiveRoutes(t *testing.T) {
	ai, err := ParseStreamPath("ai/drn-01/front/detector-v1")
	if err != nil {
		t.Fatal(err)
	}
	if ai.ProcessorID != "detector-v1" || ai.StreamID != "ai.drn-01.front.detector-v1" {
		t.Fatalf("unexpected ai route %#v", ai)
	}

	archive, err := ParseStreamPath("archive/ugv-02/rear/2026-05-22")
	if err != nil {
		t.Fatal(err)
	}
	if archive.ArchiveDate != "2026-05-22" || archive.StreamID != "archive.ugv-02.rear.2026-05-22" {
		t.Fatalf("unexpected archive route %#v", archive)
	}
}

func TestParseStreamIDRejectsInvalidRoutes(t *testing.T) {
	for _, streamID := range []string{"bad", "raw..front", "raw.local", "raw.local./front"} {
		if _, err := ParseStreamID(streamID); err == nil {
			t.Fatalf("expected %q to fail", streamID)
		}
	}
}
