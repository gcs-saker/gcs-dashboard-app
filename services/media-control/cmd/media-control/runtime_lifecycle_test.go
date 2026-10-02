package main

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestServeUntilShutdownStopsBoundedServerAfterCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	server := newHTTPServer("127.0.0.1:0", http.NotFoundHandler())

	started := time.Now()
	if err := serveUntilShutdown(ctx, server); err != nil {
		t.Fatalf("cancelled runtime should shut down cleanly: %v", err)
	}
	if elapsed := time.Since(started); elapsed >= shutdownTimeout {
		t.Fatalf("shutdown exceeded bounded timeout: %s", elapsed)
	}
}

func TestServeUntilShutdownSurfacesListenerFailure(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	server := newHTTPServer("invalid-address", http.NotFoundHandler())

	if err := serveUntilShutdown(ctx, server); err == nil {
		t.Fatal("invalid listener address must fail readiness instead of appearing healthy")
	}
}
