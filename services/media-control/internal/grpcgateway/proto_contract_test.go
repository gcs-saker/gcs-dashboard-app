package grpcgateway

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGatewayWireConstantsMatchProtoContract(t *testing.T) {
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
	if requestFieldTelemetry != 10 || requestFieldStreamEvent != 11 || requestFieldCommandAck != 12 {
		t.Fatalf("gateway request payload field constants drifted from proto contract")
	}
	if responseFieldCommand != 10 || responseFieldTelemetry != 11 {
		t.Fatalf("gateway response payload field constants drifted from proto contract")
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
