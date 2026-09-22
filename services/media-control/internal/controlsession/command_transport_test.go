package controlsession

import (
	"context"
	"errors"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

func TestCommandTransportPublishesValidatedCommandWithQoSOne(t *testing.T) {
	now := time.Now()
	client := &publishStub{}
	transport := NewCommandTransport(client, ledgerStub{true, nil}, sequenceStub{true, nil})
	err := transport.Publish(context.Background(), internalRoute(), command(now), now)
	if err != nil || client.topic != "gcs/device/session-01/command" || client.qos != 1 {
		t.Fatalf("unexpected publish topic=%s qos=%d err=%v", client.topic, client.qos, err)
	}
}

func TestCommandTransportRejectsDuplicateSequenceAndExpiry(t *testing.T) {
	now := time.Now()
	if err := NewCommandTransport(&publishStub{}, ledgerStub{false, nil}, sequenceStub{true, nil}).Publish(context.Background(), internalRoute(), command(now), now); !errors.Is(err, ErrCommandDuplicate) {
		t.Fatalf("expected duplicate, got %v", err)
	}
	if err := NewCommandTransport(&publishStub{}, ledgerStub{true, nil}, sequenceStub{false, nil}).Publish(context.Background(), internalRoute(), command(now), now); !errors.Is(err, ErrSequenceRejected) {
		t.Fatalf("expected sequence rejection, got %v", err)
	}
	expired := command(now)
	expired.ExpiresUnixMillis = now.UnixMilli()
	if err := NewCommandTransport(&publishStub{}, ledgerStub{true, nil}, sequenceStub{true, nil}).Publish(context.Background(), internalRoute(), expired, now); !errors.Is(err, ErrCommandExpired) {
		t.Fatalf("expected expiry rejection, got %v", err)
	}
}

func TestDecodeAckBindsTopicSessionAndRejectsMalformedPayload(t *testing.T) {
	ack := &pb.ControlCommandAck{CommandId: "command-01", ControlSessionId: "session-01", DeviceId: "device-01", Sequence: 1, Status: pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED}
	wire, _ := proto.Marshal(ack)
	decoded, err := DecodeAck("gcs/device/session-01/ack", wire)
	if err != nil || decoded.CommandId != "command-01" {
		t.Fatalf("unexpected ack: %+v err=%v", decoded, err)
	}
	if _, err := DecodeAck("gcs/device/session-02/ack", wire); !errors.Is(err, ErrAckInvalid) {
		t.Fatalf("expected session mismatch rejection, got %v", err)
	}
}

func internalRoute() InternalRoute {
	return InternalRoute{deviceID: "device-01", commandTopic: "gcs/device/session-01/command"}
}

func command(now time.Time) *pb.ControlCommandEnvelope {
	return &pb.ControlCommandEnvelope{CommandId: "command-01", ControlSessionId: "control-01", DeviceId: "device-01", Sequence: 1,
		CommandType: pb.ControlCommandType_CONTROL_COMMAND_TYPE_STOP, IssuedUnixMillis: now.UnixMilli(), ExpiresUnixMillis: now.Add(2 * time.Second).UnixMilli(), IdempotencyId: "idempotency-01"}
}

type ledgerStub struct {
	reserved bool
	err      error
}

func (s ledgerStub) Reserve(context.Context, string, time.Time) (bool, error) {
	return s.reserved, s.err
}

type sequenceStub struct {
	accepted bool
	err      error
}

func (s sequenceStub) Accept(context.Context, string, uint64, time.Time) (bool, error) {
	return s.accepted, s.err
}

type publishStub struct {
	topic string
	qos   byte
}

func (s *publishStub) Publish(topic string, qos byte, _ bool, _ any) mqtt.Token {
	s.topic, s.qos = topic, qos
	return successfulToken{}
}

type successfulToken struct{}

func (successfulToken) Wait() bool                     { return true }
func (successfulToken) WaitTimeout(time.Duration) bool { return true }
func (successfulToken) Error() error                   { return nil }
func (successfulToken) Done() <-chan struct{}          { done := make(chan struct{}); close(done); return done }
