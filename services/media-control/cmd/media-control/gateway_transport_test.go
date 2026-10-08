package main

import (
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
)

func TestGatewayTransportFailsClosedUnlessLocalPlaintextIsExplicit(t *testing.T) {
	t.Setenv("MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT", "false")
	t.Setenv("MEDIA_CONTROL_GRPC_CA_FILE", "")
	t.Setenv("MEDIA_CONTROL_GRPC_CERT_FILE", "")
	t.Setenv("MEDIA_CONTROL_GRPC_KEY_FILE", "")
	if _, err := configureGatewayTransport(grpcgateway.NewServer("token", 1024)); err == nil {
		t.Fatal("missing gRPC mTLS material was accepted")
	}
	t.Setenv("MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT", "true")
	if _, err := configureGatewayTransport(grpcgateway.NewServer("token", 1024)); err != nil {
		t.Fatalf("explicit local-test plaintext was rejected: %v", err)
	}
}
