package main

import (
	"net/http"
	"testing"
)

func TestHTTPServerHasBoundedTimeouts(t *testing.T) {
	server := newHTTPServer(":8081", http.NotFoundHandler())
	if server.ReadHeaderTimeout <= 0 || server.ReadTimeout <= 0 || server.WriteTimeout <= 0 || server.IdleTimeout <= 0 {
		t.Fatal("all media-control HTTP server timeouts must be bounded")
	}
}
