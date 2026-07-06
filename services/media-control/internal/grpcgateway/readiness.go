package grpcgateway

import (
	"context"
	"errors"
	"log"
	"net"
	"strings"
	"sync"
)

type Readiness struct {
	mu      sync.RWMutex
	enabled bool
	ready   bool
	reason  string
}

func StartWithReadiness(ctx context.Context, listenAddress string, token string, maxPayloadBytes int) *Readiness {
	state := &Readiness{
		enabled: strings.TrimSpace(listenAddress) != "",
		reason:  "starting",
	}
	server := NewServer(token, maxPayloadBytes)
	go serveWithReadiness(ctx, server, listenAddress, state)
	return state
}

func serveWithReadiness(ctx context.Context, server Server, listenAddress string, state *Readiness) {
	if !state.enabled {
		state.markReady()
		return
	}
	if err := server.serve(ctx, listenAddress, state.markReady); err != nil {
		state.markFailed(grpcFailureReason(err))
		log.Printf("gRPC gateway stopped: %v", err)
	}
}

func grpcFailureReason(err error) string {
	var netError *net.OpError
	if errors.As(err, &netError) && netError.Op == "listen" {
		return "listen_failed"
	}
	return "serve_failed"
}

func (r *Readiness) Ready() (bool, string) {
	if r == nil {
		return true, ""
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.ready, r.reason
}

func (r *Readiness) markReady() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready = true
	r.reason = ""
}

func (r *Readiness) markFailed(reason string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.ready = false
	r.reason = reason
}
