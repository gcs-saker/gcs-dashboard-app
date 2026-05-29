package mediamtx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListStreamsMapsMediaMTXPaths(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/paths/list" {
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"items":[{"name":"raw/local/webcam","ready":true,"source":"publisher","readerCount":2}]}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	streams, err := client.ListStreams(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(streams) != 1 {
		t.Fatalf("expected one stream, got %d", len(streams))
	}
	if !streams[0].Ready || streams[0].ReaderCount != 2 {
		t.Fatalf("unexpected stream descriptor: %+v", streams[0])
	}
}

func TestListStreamsReturnsStatusError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	_, err := client.ListStreams(context.Background())
	if err == nil {
		t.Fatal("expected mediamtx status error")
	}
}
