package mqttgateway

import (
	"context"
	"errors"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mqtttopic"
	"google.golang.org/protobuf/proto"
)

const (
	Subscription    = mqtttopic.TelemetrySubscription
	MaxPayloadBytes = 64 * 1024
)

type Exchange func(context.Context, string, string, *pb.GatewayStreamRequest) (*pb.GatewayStreamResponse, error)

func SessionFromTopic(topic string) (string, error) {
	binding, err := telemetryTopic(topic)
	return binding.PublishSession, err
}

func Handle(ctx context.Context, exchange Exchange, topic string, payload []byte) (*pb.GatewayStreamResponse, error) {
	binding, err := telemetryTopic(topic)
	if err != nil {
		return nil, err
	}
	if len(payload) > MaxPayloadBytes {
		return nil, errors.New("mqtt_payload_too_large")
	}
	message := &pb.MqttGatewayMessage{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return nil, errors.New("mqtt_payload_invalid")
	}
	if message.PublishToken == "" || message.Request == nil || message.Request.GetTelemetry() == nil {
		return nil, errors.New("mqtt_telemetry_required")
	}
	if message.Request.AssetId != binding.DeviceUUID || message.Request.GetTelemetry().AssetId != binding.DeviceUUID {
		return nil, errors.New("mqtt_device_identity_mismatch")
	}
	return exchange(ctx, binding.PublishSession, message.PublishToken, message.Request)
}

func telemetryTopic(raw string) (mqtttopic.Topic, error) {
	binding, err := mqtttopic.Parse(raw)
	if err != nil || binding.Channel != mqtttopic.Telemetry {
		return mqtttopic.Topic{}, mqtttopic.ErrTopicInvalid
	}
	return binding, nil
}
