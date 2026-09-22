package deviceadapter

import (
	"testing"
	"time"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

func TestAdapterMapsOnlyTypedCommandsToFixedFunctions(t *testing.T) {
	now := time.Now()
	actuator := &fakeActuator{}
	adapter := New(actuator)
	adapter.BeginLease("control-01", now.Add(30*time.Second), now)
	ack := adapter.Execute(motionCommand(now, 0.5), now)
	if ack.Status != pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED || actuator.motionCalls != 1 {
		t.Fatalf("expected applied motion, ack=%v calls=%d", ack.Status, actuator.motionCalls)
	}
}

func TestAdapterRejectsRangeSessionAndUnsupportedCommand(t *testing.T) {
	now := time.Now()
	adapter := New(&fakeActuator{})
	adapter.BeginLease("control-01", now.Add(30*time.Second), now)
	outOfRange := motionCommand(now, 2)
	if ack := adapter.Execute(outOfRange, now); ack.ErrorCode != pb.ControlErrorCode_CONTROL_ERROR_CODE_PARAMETER_RANGE {
		t.Fatalf("unexpected range ack: %v", ack.ErrorCode)
	}
	wrong := motionCommand(now, 0)
	wrong.ControlSessionId = "control-02"
	if ack := adapter.Execute(wrong, now); ack.ErrorCode != pb.ControlErrorCode_CONTROL_ERROR_CODE_LEASE_MISMATCH {
		t.Fatalf("unexpected lease ack: %v", ack.ErrorCode)
	}
	unsupported := motionCommand(now, 0)
	unsupported.CommandType = pb.ControlCommandType_CONTROL_COMMAND_TYPE_UNSPECIFIED
	if ack := adapter.Execute(unsupported, now); ack.ErrorCode != pb.ControlErrorCode_CONTROL_ERROR_CODE_UNSUPPORTED {
		t.Fatalf("unexpected unsupported ack: %v", ack.ErrorCode)
	}
}

func TestHeartbeatLeaseAndDisconnectTriggerOneFailSafeStop(t *testing.T) {
	now := time.Now()
	actuator := &fakeActuator{}
	adapter := New(actuator)
	adapter.BeginLease("control-01", now.Add(30*time.Second), now)
	if err := adapter.CheckFailSafe(now.Add(MaxHeartbeatGap + time.Millisecond)); err != nil {
		t.Fatal(err)
	}
	if err := adapter.CheckFailSafe(now.Add(10 * time.Second)); err != nil {
		t.Fatal(err)
	}
	if actuator.stopCalls != 1 {
		t.Fatalf("expected one fail-safe stop, got %d", actuator.stopCalls)
	}
}

func motionCommand(now time.Time, forward float64) *pb.ControlCommandEnvelope {
	return &pb.ControlCommandEnvelope{CommandId: "command-01", ControlSessionId: "control-01", DeviceId: "device-01", Sequence: 1,
		CommandType: pb.ControlCommandType_CONTROL_COMMAND_TYPE_MOTION, ExpiresUnixMillis: now.Add(time.Second).UnixMilli(),
		Parameters: &pb.ControlCommandEnvelope_Motion{Motion: &pb.MotionAxes{Forward: forward}}}
}

type fakeActuator struct{ motionCalls, stopCalls int }

func (f *fakeActuator) Stop() error                     { f.stopCalls++; return nil }
func (f *fakeActuator) Motion(_, _, _, _ float64) error { f.motionCalls++; return nil }
func (*fakeActuator) Camera(_, _ float64) error         { return nil }
func (*fakeActuator) ReturnHome() error                 { return nil }
func (f *fakeActuator) EmergencyStop() error            { f.stopCalls++; return nil }
