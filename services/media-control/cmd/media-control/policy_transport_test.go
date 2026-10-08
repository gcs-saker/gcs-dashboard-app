package main

import (
	"context"
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
)

func TestPolicyTransportFailsClosedWithoutRPC(t *testing.T) {
	config := runtimeConfig{authMode: "required", authPolicyBaseURL: "http://auth-policy:8080"}
	if _, err := newAuthorizer(config); err == nil {
		t.Fatal("production authorizer accepted HTTP fallback without explicit local-test flag")
	}
	adapter := gatewayAuthAdapter{}
	if _, err := adapter.AuthenticateGateway(context.Background(), grpcgateway.GatewayCredentials{}); err == nil {
		t.Fatal("gateway authentication accepted missing private policy RPC")
	}
	config.authPolicyHTTPFallback = true
	if _, err := newAuthorizer(config); err != nil {
		t.Fatalf("explicit local-test HTTP fallback rejected: %v", err)
	}
}
