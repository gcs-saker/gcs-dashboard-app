package controlsession

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlroute"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

const (
	commandQoS      = 1
	commandTimeout  = 5 * time.Second
	maxCommandBytes = 16 * 1024
	ackTopicSuffix  = "ack"
)

var (
	ErrCommandInvalid     = errors.New("control_command_invalid")
	ErrCommandExpired     = errors.New("control_command_expired")
	ErrCommandDuplicate   = errors.New("control_command_duplicate")
	ErrSequenceRejected   = errors.New("control_sequence_rejected")
	ErrCommandUnavailable = errors.New("control_command_unavailable")
	ErrAckInvalid         = errors.New("control_ack_invalid")
)

var ackSessionSegment = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

type IdempotencyLedger interface {
	Reserve(context.Context, string, time.Time) (bool, error)
}

type SequenceLedger interface {
	Accept(context.Context, string, uint64, time.Time) (bool, error)
}

type commandMQTTClient interface {
	Publish(string, byte, bool, any) mqtt.Token
}

type CommandTransport struct {
	client      commandMQTTClient
	idempotency IdempotencyLedger
	sequences   SequenceLedger
}

func NewCommandTransport(client commandMQTTClient, idempotency IdempotencyLedger, sequences SequenceLedger) CommandTransport {
	return CommandTransport{client: client, idempotency: idempotency, sequences: sequences}
}

func (t CommandTransport) Publish(ctx context.Context, route controlroute.InternalRoute, command *pb.ControlCommandEnvelope, now time.Time) error {
	if err := validateCommand(route, command, now); err != nil {
		return err
	}
	expiresAt := time.UnixMilli(command.ExpiresUnixMillis)
	if err := t.reserveCommand(ctx, command.IdempotencyId, expiresAt); err != nil {
		return err
	}
	if err := t.acceptSequence(ctx, command.ControlSessionId, command.Sequence, expiresAt); err != nil {
		return err
	}
	return t.publishWire(route.CommandTopic(), command)
}

func (t CommandTransport) reserveCommand(ctx context.Context, id string, expiresAt time.Time) error {
	reserved, err := t.idempotency.Reserve(ctx, id, expiresAt)
	if err != nil {
		return ErrCommandUnavailable
	}
	if !reserved {
		return ErrCommandDuplicate
	}
	return nil
}

func (t CommandTransport) acceptSequence(ctx context.Context, sessionID string, sequence uint64, expiresAt time.Time) error {
	accepted, err := t.sequences.Accept(ctx, sessionID, sequence, expiresAt)
	if err != nil {
		return ErrCommandUnavailable
	}
	if !accepted {
		return ErrSequenceRejected
	}
	return nil
}

func (t CommandTransport) publishWire(topic string, command *pb.ControlCommandEnvelope) error {
	wire, err := proto.Marshal(command)
	if err != nil || len(wire) > maxCommandBytes || t.client == nil {
		return ErrCommandUnavailable
	}
	token := t.client.Publish(topic, commandQoS, false, wire)
	if !token.WaitTimeout(commandTimeout) || token.Error() != nil {
		return ErrCommandUnavailable
	}
	return nil
}

func DecodeAck(topic string, payload []byte) (*pb.ControlCommandAck, error) {
	sessionID, ok := ackSession(topic)
	if !ok || len(payload) == 0 || len(payload) > maxCommandBytes {
		return nil, ErrAckInvalid
	}
	ack := &pb.ControlCommandAck{}
	if proto.Unmarshal(payload, ack) != nil || ack.ControlSessionId != sessionID || ack.CommandId == "" || ack.Sequence == 0 {
		return nil, ErrAckInvalid
	}
	return ack, nil
}

func validateCommand(route controlroute.InternalRoute, command *pb.ControlCommandEnvelope, now time.Time) error {
	if command == nil || command.CommandId == "" || command.IdempotencyId == "" || command.Sequence == 0 {
		return ErrCommandInvalid
	}
	if command.DeviceId != route.DeviceID() || command.ControlSessionId == "" {
		return ErrCommandInvalid
	}
	issued, expires := time.UnixMilli(command.IssuedUnixMillis), time.UnixMilli(command.ExpiresUnixMillis)
	if !expires.After(now) || expires.Sub(issued) <= 0 || expires.Sub(issued) > commandTimeout {
		return ErrCommandExpired
	}
	return nil
}

func ackSession(topic string) (string, bool) {
	parts := strings.Split(topic, "/")
	returnValue := len(parts) == 4 && parts[0] == "gcs" && parts[1] == "device" && parts[3] == ackTopicSuffix
	if !returnValue || !ackSessionSegment.MatchString(parts[2]) {
		return "", false
	}
	return parts[2], true
}
