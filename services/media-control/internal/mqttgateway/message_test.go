package mqttgateway

import (
	"context"
	"testing"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

func TestMessageDoesNotRequireReceiverOrGroup(t *testing.T) {
	request := &pb.GatewayStreamRequest{RequestId: "event-1", AssetId: "device-1",
		Payload: &pb.GatewayStreamRequest_Telemetry{Telemetry: &pb.TelemetryEnvelope{AssetId: "device-1"}}}
	wire, err := proto.Marshal(&pb.MqttGatewayMessage{PublishToken: "opaque-token", Request: request})
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	exchange := func(_ context.Context, sessionID, token string, message *pb.GatewayStreamRequest) (*pb.GatewayStreamResponse, error) {
		calls++
		if sessionID != "ps_test" || token != "opaque-token" || message.GroupId != "" {
			t.Fatal("client scope was injected")
		}
		return &pb.GatewayStreamResponse{RequestId: message.RequestId}, nil
	}
	if _, err := Handle(context.Background(), exchange, "gcs/device/ps_test/telemetry", wire); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal("message not forwarded")
	}
	for _, topic := range []string{"gcs/org/group/device/telemetry", "gcs/device/+/telemetry", "gcs/device/ps_test/command"} {
		if _, err := Handle(context.Background(), exchange, topic, wire); err == nil {
			t.Fatalf("accepted topic %s", topic)
		}
	}
	if calls != 1 {
		t.Fatal("invalid topic reached gateway")
	}
}

func TestMalformedAndOversizedMessagesNeverReachGateway(t *testing.T) {
	exchange := func(context.Context, string, string, *pb.GatewayStreamRequest) (*pb.GatewayStreamResponse, error) {
		t.Fatal("invalid payload reached gateway")
		return nil, nil
	}
	for _, payload := range [][]byte{nil, {0xff}, make([]byte, MaxPayloadBytes+1)} {
		if _, err := Handle(context.Background(), exchange, "gcs/device/ps_test/telemetry", payload); err == nil {
			t.Fatal("accepted invalid payload")
		}
	}
}
