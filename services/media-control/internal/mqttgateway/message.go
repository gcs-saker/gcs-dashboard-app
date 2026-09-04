package mqttgateway

import (
	"context"
	"errors"
	"regexp"
	"strings"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

const (
	Subscription    = "gcs/device/+/telemetry"
	MaxPayloadBytes = 64 * 1024
)

var sessionSegment = regexp.MustCompile(`^ps_[A-Za-z0-9_-]{1,96}$`)

type Exchange func(context.Context, string, string, *pb.GatewayStreamRequest) (*pb.GatewayStreamResponse, error)

func SessionFromTopic(topic string) (string, error) {
	parts := strings.Split(topic, "/")
	if len(parts) != 4 || parts[0] != "gcs" || parts[1] != "device" || parts[3] != "telemetry" || !sessionSegment.MatchString(parts[2]) {
		return "", errors.New("mqtt_topic_invalid")
	}
	return parts[2], nil
}

func Handle(ctx context.Context, exchange Exchange, topic string, payload []byte) (*pb.GatewayStreamResponse, error) {
	sessionID, err := SessionFromTopic(topic)
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
	return exchange(ctx, sessionID, message.PublishToken, message.Request)
}
