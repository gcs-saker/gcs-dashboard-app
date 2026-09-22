package deviceadapter

import (
	"errors"
	"math"
	"sync"
	"time"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

const MaxHeartbeatGap = 3 * time.Second

var ErrActuatorFailure = errors.New("device_actuator_failure")

type Actuator interface {
	Stop() error
	Motion(forward, right, up, yaw float64) error
	Camera(pan, tilt float64) error
	ReturnHome() error
	EmergencyStop() error
}

type Adapter struct {
	mu            sync.Mutex
	actuator      Actuator
	sessionID     string
	leaseExpires  time.Time
	lastHeartbeat time.Time
	stopped       bool
}

func New(actuator Actuator) *Adapter { return &Adapter{actuator: actuator, stopped: true} }

func (a *Adapter) BeginLease(sessionID string, expiresAt, now time.Time) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.actuator == nil || sessionID == "" || !expiresAt.After(now) {
		return false
	}
	a.sessionID, a.leaseExpires, a.lastHeartbeat, a.stopped = sessionID, expiresAt, now, false
	return true
}

func (a *Adapter) Heartbeat(sessionID string, now time.Time) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.stopped || sessionID != a.sessionID || !a.leaseExpires.After(now) {
		return false
	}
	a.lastHeartbeat = now
	return true
}

func (a *Adapter) Execute(command *pb.ControlCommandEnvelope, now time.Time) *pb.ControlCommandAck {
	a.mu.Lock()
	defer a.mu.Unlock()
	ack := acknowledgement(command, now)
	if !a.commandAllowed(command, now) {
		return reject(ack, pb.ControlErrorCode_CONTROL_ERROR_CODE_LEASE_MISMATCH)
	}
	if err := a.apply(command); err != nil {
		return reject(ack, errorCode(err))
	}
	ack.Status = pb.ControlAckStatus_CONTROL_ACK_STATUS_APPLIED
	ack.ErrorCode = pb.ControlErrorCode_CONTROL_ERROR_CODE_NONE
	return ack
}

func (a *Adapter) CheckFailSafe(now time.Time) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.stopped || (now.Sub(a.lastHeartbeat) <= MaxHeartbeatGap && a.leaseExpires.After(now)) {
		return nil
	}
	return a.stopLocked()
}

func (a *Adapter) Disconnect() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.stopped {
		return nil
	}
	return a.stopLocked()
}

func (a *Adapter) commandAllowed(command *pb.ControlCommandEnvelope, now time.Time) bool {
	return command != nil && !a.stopped && command.ControlSessionId == a.sessionID &&
		a.leaseExpires.After(now) && command.ExpiresUnixMillis > now.UnixMilli()
}

func (a *Adapter) apply(command *pb.ControlCommandEnvelope) error {
	switch command.CommandType {
	case pb.ControlCommandType_CONTROL_COMMAND_TYPE_STOP:
		return a.stopLocked()
	case pb.ControlCommandType_CONTROL_COMMAND_TYPE_MOTION:
		axes := command.GetMotion()
		if axes == nil || !validAxes(axes.Forward, axes.Right, axes.Up, axes.Yaw) {
			return errRange
		}
		return a.actuator.Motion(axes.Forward, axes.Right, axes.Up, axes.Yaw)
	case pb.ControlCommandType_CONTROL_COMMAND_TYPE_CAMERA_PAN_TILT:
		camera := command.GetCamera()
		if camera == nil || !validAxes(camera.Pan, camera.Tilt) {
			return errRange
		}
		return a.actuator.Camera(camera.Pan, camera.Tilt)
	case pb.ControlCommandType_CONTROL_COMMAND_TYPE_RETURN_HOME:
		return a.actuator.ReturnHome()
	case pb.ControlCommandType_CONTROL_COMMAND_TYPE_EMERGENCY_STOP:
		a.stopped = true
		return a.actuator.EmergencyStop()
	default:
		return errUnsupported
	}
}

func (a *Adapter) stopLocked() error { a.stopped = true; return a.actuator.Stop() }

var errRange = errors.New("parameter_range")
var errUnsupported = errors.New("unsupported_command")

func validAxes(values ...float64) bool {
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) || value < -1 || value > 1 {
			return false
		}
	}
	return true
}

func errorCode(err error) pb.ControlErrorCode {
	if errors.Is(err, errRange) {
		return pb.ControlErrorCode_CONTROL_ERROR_CODE_PARAMETER_RANGE
	}
	if errors.Is(err, errUnsupported) {
		return pb.ControlErrorCode_CONTROL_ERROR_CODE_UNSUPPORTED
	}
	return pb.ControlErrorCode_CONTROL_ERROR_CODE_DEVICE_UNAVAILABLE
}

func acknowledgement(command *pb.ControlCommandEnvelope, now time.Time) *pb.ControlCommandAck {
	ack := &pb.ControlCommandAck{AppliedUnixMillis: now.UnixMilli(), DeviceUnixMillis: now.UnixMilli()}
	if command != nil {
		ack.CommandId, ack.ControlSessionId, ack.DeviceId, ack.Sequence = command.CommandId, command.ControlSessionId, command.DeviceId, command.Sequence
	}
	return ack
}

func reject(ack *pb.ControlCommandAck, code pb.ControlErrorCode) *pb.ControlCommandAck {
	ack.Status, ack.ErrorCode = pb.ControlAckStatus_CONTROL_ACK_STATUS_REJECTED, code
	return ack
}
