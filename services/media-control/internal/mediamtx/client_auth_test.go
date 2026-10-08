package mediamtx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestManagementClientSendsBasicAuthAndRejectsUnauthorized(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		username, password, ok := r.BasicAuth()
		if !ok || username != "media-control" || password != "secret" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	t.Cleanup(server.Close)

	client := NewAuthenticatedClient(server.URL, "media-control", "secret", server.Client())
	if _, err := client.ListStreams(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := NewClient(server.URL, server.Client()).ListStreams(context.Background()); err == nil {
		t.Fatal("management API accepted a client without credentials")
	}
}
