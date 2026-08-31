package grpcgateway

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

func TestGeneratedGatewayDescriptorMatchesProtoContract(t *testing.T) {
	content := readGatewayProto(t)

	assertProtoContains(t, content, "service SakerGatewayService")
	assertProtoContains(t, content, "rpc Exchange(stream GatewayStreamRequest) returns (stream GatewayStreamResponse);")
	assertProtoContains(t, content, "string request_id = 1;")
	assertProtoContains(t, content, "string org_id = 2;")
	assertProtoContains(t, content, "string group_id = 3;")
	assertProtoContains(t, content, "string asset_id = 4;")
	assertProtoContains(t, content, "TelemetryEnvelope telemetry = 10;")
	assertProtoContains(t, content, "StreamSessionEvent stream_event = 11;")
	assertProtoContains(t, content, "CommandAck command_ack = 12;")
	assertProtoContains(t, content, "string response_id = 1;")
	assertProtoContains(t, content, "GatewayAckStatus status = 3;")
	assertProtoContains(t, content, "StreamCommand command = 10;")
	assertProtoContains(t, content, "TelemetryBatch telemetry_batch = 11;")

	if fullMethodExchange != "/gcs.saker.v1.SakerGatewayService/Exchange" {
		t.Fatalf("grpc method drifted from proto contract: %s", fullMethodExchange)
	}
	request := (&sakerv1.GatewayStreamRequest{}).ProtoReflect().Descriptor().Fields()
	response := (&sakerv1.GatewayStreamResponse{}).ProtoReflect().Descriptor().Fields()
	if request.ByName("telemetry").Number() != 10 || request.ByName("stream_event").Number() != 11 || request.ByName("command_ack").Number() != 12 {
		t.Fatal("generated gateway request descriptor drifted from proto contract")
	}
	if response.ByName("command").Number() != 10 || response.ByName("telemetry_batch").Number() != 11 {
		t.Fatal("generated gateway response descriptor drifted from proto contract")
	}
}

func readGatewayProto(t *testing.T) string {
	t.Helper()
	path := filepath.Join("..", "..", "..", "..", "contracts", "proto", "gcs", "saker", "v1", "gateway_service.proto")
	payload, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			t.Skipf("gateway proto contract is outside the media-control Docker build context: %s", path)
		}
		t.Fatalf("read gateway proto contract: %v", err)
	}
	return string(payload)
}

func assertProtoContains(t *testing.T, content string, expected string) {
	t.Helper()
	if !strings.Contains(content, expected) {
		t.Fatalf("gateway proto contract is missing %q", expected)
	}
}
