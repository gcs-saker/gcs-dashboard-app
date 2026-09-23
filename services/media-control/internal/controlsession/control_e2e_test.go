package controlsession_test

import (
	"context"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlroute"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controltransport"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/deviceadapter"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

func TestControlCommandE2ESuccessAndAck(t *testing.T) {
	now := time.Now()
	store := domain.NewInMemoryPublishSessionStore()
	_ = store.Save(context.Background(), activeSession(now))
	route, err := controlroute.NewRouteResolver(store).Resolve(context.Background(), controlroute.RouteRequest{
		DeviceID: "device-01", PublishSession: "session-01", Now: now,
	})
	if err != nil {
		t.Fatal(err)
	}
	actuator := &e2eActuator{}
	adapter := deviceadapter.New(actuator)
	if !adapter.BeginLease("control-01", now.Add(30*time.Second), now) {
		t.Fatal("lease rejected")
	}
	loopback := &loopbackPublisher{adapter: adapter, now: now}
	transport := controltransport.NewCommandTransport(loopback, allowLedger{}, allowSequence{})
	if err := transport.Publish(context.Background(), route, stopCommand(now), now); err != nil {
		t.Fatal(err)
	}
	ack, err := controltransport.DecodeAck("gcs/device/control-01/ack", loopback.ack)
	if err != nil || ack.Status != pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED || actuator.stops != 1 {
		t.Fatalf("unexpected result ack=%v stops=%d err=%v", ack, actuator.stops, err)
	}
}

func TestControlCommandE2EFailSafeAndEmergencyStop(t *testing.T) {
	now := time.Now()
	actuator := &e2eActuator{}
	adapter := deviceadapter.New(actuator)
	adapter.BeginLease("control-01", now.Add(30*time.Second), now)
	if err := adapter.CheckFailSafe(now.Add(deviceadapter.MaxHeartbeatGap + time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	adapter.BeginLease("control-02", now.Add(30*time.Second), now)
	command := stopCommand(now)
	command.ControlSessionId = "control-02"
	command.CommandType = pb.ControlCommandType_CONTROL_COMMAND_TYPE_EMERGENCY_STOP
	if ack := adapter.Execute(command, now); ack.Status != pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED {
		t.Fatal(ack.Status)
	}
	if actuator.stops != 2 {
		t.Fatalf("expected fail-safe and emergency stops, got %d", actuator.stops)
	}
}

func activeSession(now time.Time) domain.PublishSession {
	return domain.PublishSession{SessionID: "session-01", DeviceUUID: "device-01", GroupID: "co-a",
		Status: domain.PublishSessionActive, RenewalTokenExpiresAt: now.Add(time.Minute)}
}

func stopCommand(now time.Time) *pb.ControlCommandEnvelope {
	return &pb.ControlCommandEnvelope{CommandId: "command-01", ControlSessionId: "control-01", DeviceId: "device-01",
		Sequence: 1, CommandType: pb.ControlCommandType_CONTROL_COMMAND_TYPE_STOP, IssuedUnixMillis: now.UnixMilli(),
		ExpiresUnixMillis: now.Add(time.Second).UnixMilli(), IdempotencyId: "idempotency-01"}
}

type allowLedger struct{}

func (allowLedger) Reserve(context.Context, string, time.Time) (bool, error) { return true, nil }

type allowSequence struct{}

func (allowSequence) Accept(context.Context, string, uint64, time.Time) (bool, error) {
	return true, nil
}

type e2eActuator struct{ stops int }

func (a *e2eActuator) Stop() error                   { a.stops++; return nil }
func (*e2eActuator) Motion(_, _, _, _ float64) error { return nil }
func (*e2eActuator) Camera(_, _ float64) error       { return nil }
func (*e2eActuator) ReturnHome() error               { return nil }
func (a *e2eActuator) EmergencyStop() error          { a.stops++; return nil }

type loopbackPublisher struct {
	adapter *deviceadapter.Adapter
	now     time.Time
	ack     []byte
}

func (p *loopbackPublisher) Publish(_ string, _ byte, _ bool, payload any) mqtt.Token {
	command := &pb.ControlCommandEnvelope{}
	_ = proto.Unmarshal(payload.([]byte), command)
	p.ack, _ = proto.Marshal(p.adapter.Execute(command, p.now))
	return e2eToken{}
}

type e2eToken struct{}

func (e2eToken) Wait() bool                     { return true }
func (e2eToken) WaitTimeout(time.Duration) bool { return true }
func (e2eToken) Error() error                   { return nil }
func (e2eToken) Done() <-chan struct{}          { done := make(chan struct{}); close(done); return done }
