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
	if err := validateMQTTMessage(binding, message); err != nil {
		return nil, err
	}
	return exchange(ctx, binding.PublishSession, message.PublishToken, message.Request)
}

func validateMQTTMessage(binding mqtttopic.Topic, message *pb.MqttGatewayMessage) error {
	if message.PublishToken == "" || message.Request == nil || message.Request.GetTelemetry() == nil {
		return errors.New("mqtt_telemetry_required")
	}
	if mqttMessageHasUnknownFields(message) {
		return errors.New("mqtt_unknown_fields_forbidden")
	}
	if message.Request.GroupId != "" {
		return errors.New("mqtt_group_input_forbidden")
	}
	if message.Request.AssetId != binding.DeviceUUID || message.Request.GetTelemetry().AssetId != binding.DeviceUUID {
		return errors.New("mqtt_device_identity_mismatch")
	}
	return nil
}

func mqttMessageHasUnknownFields(message *pb.MqttGatewayMessage) bool {
	request := message.GetRequest()
	telemetry := request.GetTelemetry()
	return len(message.ProtoReflect().GetUnknown()) > 0 ||
		len(request.ProtoReflect().GetUnknown()) > 0 ||
		len(telemetry.ProtoReflect().GetUnknown()) > 0
}

func telemetryTopic(raw string) (mqtttopic.Topic, error) {
	binding, err := mqtttopic.Parse(raw)
	if err != nil || binding.Channel != mqtttopic.Telemetry {
		return mqtttopic.Topic{}, mqtttopic.ErrTopicInvalid
	}
	return binding, nil
}
