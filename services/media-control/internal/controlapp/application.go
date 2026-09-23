package controlapp

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlsession"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

const (
	controlLeaseDuration = 30 * time.Second
	maxControlSessions   = 1024
)

var (
	ErrDenied      = errors.New("control_denied")
	ErrConflict    = errors.New("control_conflict")
	ErrUnavailable = errors.New("control_unavailable")
)

type SessionRequest struct{ DeviceID, PublishSession string }
type SessionResponse struct {
	ControlSessionID, ExpiresAt string
	HeartbeatMillis             int
}
type CommandRequest struct {
	Command        string
	Sequence       uint64
	IdempotencyID  string
	Forward, Right float64
}
type CommandResponse struct{ CommandID, Status string }

type ControlPolicyTarget struct {
	Action, DeviceID, Command, ControlSessionID string
	HighRiskConfirmed                           bool
	LeaseExpiresAt                              time.Time
}

type ControlPolicyClient interface {
	AuthorizeControl(context.Context, string, ControlPolicyTarget) (bool, error)
}

type ControlLeaseStore interface {
	Acquire(context.Context, string, string, time.Time, time.Time) (bool, error)
}

type ControlRouteResolver interface {
	Resolve(context.Context, controlsession.RouteRequest) (controlsession.InternalRoute, error)
}

type ControlCommandPublisher interface {
	Publish(context.Context, controlsession.InternalRoute, *pb.ControlCommandEnvelope, time.Time) error
}

type controlSessionState struct {
	deviceID, publishSession string
	route                    controlsession.InternalRoute
	expiresAt                time.Time
	nextSequence             uint64
}

type ControlApplication struct {
	mu       sync.Mutex
	policy   ControlPolicyClient
	leases   ControlLeaseStore
	routes   ControlRouteResolver
	commands ControlCommandPublisher
	now      func() time.Time
	newID    func(string) (string, error)
	sessions map[string]controlSessionState
}

func NewControlApplication(policy ControlPolicyClient, leases ControlLeaseStore, routes ControlRouteResolver, commands ControlCommandPublisher) *ControlApplication {
	return &ControlApplication{policy: policy, leases: leases, routes: routes, commands: commands,
		now: time.Now, newID: randomOpaqueID, sessions: make(map[string]controlSessionState)}
}

func (a *ControlApplication) CreateSession(ctx context.Context, authorization string, request SessionRequest) (SessionResponse, error) {
	now := a.now()
	sessionID, idErr := a.newID("cs_")
	if idErr != nil {
		return SessionResponse{}, ErrUnavailable
	}
	route, err := a.routes.Resolve(ctx, controlsession.RouteRequest{DeviceID: request.DeviceID, PublishSession: request.PublishSession, Now: now})
	if err != nil {
		return SessionResponse{}, ErrDenied
	}
	allowed, err := a.policy.AuthorizeControl(ctx, authorization, ControlPolicyTarget{Action: "acquire", DeviceID: request.DeviceID, Command: "STOP"})
	if err != nil || !allowed {
		return SessionResponse{}, ErrDenied
	}
	expiresAt := now.Add(controlLeaseDuration)
	acquired, err := a.leases.Acquire(ctx, request.DeviceID, sessionID, expiresAt, now)
	if err != nil {
		return SessionResponse{}, ErrUnavailable
	}
	if !acquired {
		return SessionResponse{}, ErrConflict
	}
	a.mu.Lock()
	a.pruneExpiredLocked(now)
	if len(a.sessions) >= maxControlSessions {
		a.mu.Unlock()
		return SessionResponse{}, ErrUnavailable
	}
	a.sessions[sessionID] = controlSessionState{request.DeviceID, request.PublishSession, route, expiresAt, 1}
	a.mu.Unlock()
	return SessionResponse{sessionID, expiresAt.UTC().Format(time.RFC3339Nano), 1000}, nil
}

func (a *ControlApplication) pruneExpiredLocked(now time.Time) {
	for sessionID, state := range a.sessions {
		if !state.expiresAt.After(now) {
			delete(a.sessions, sessionID)
		}
	}
}

func (a *ControlApplication) SubmitCommand(ctx context.Context, authorization, sessionID string, request CommandRequest) (CommandResponse, error) {
	a.mu.Lock()
	state, ok := a.sessions[sessionID]
	sequenceAccepted := ok && request.Sequence == state.nextSequence
	if sequenceAccepted {
		state.nextSequence++
		a.sessions[sessionID] = state
	}
	a.mu.Unlock()
	if !sequenceAccepted || !state.expiresAt.After(a.now()) {
		return CommandResponse{}, ErrDenied
	}
	allowed, err := a.policy.AuthorizeControl(ctx, authorization, ControlPolicyTarget{Action: "command", DeviceID: state.deviceID,
		Command: request.Command, ControlSessionID: sessionID, LeaseExpiresAt: state.expiresAt})
	if err != nil || !allowed {
		return CommandResponse{}, ErrDenied
	}
	commandID, idErr := a.newID("cmd_")
	if idErr != nil {
		return CommandResponse{}, ErrUnavailable
	}
	command, err := buildControlCommand(controlCommandInput{commandID, sessionID, state.deviceID, request, a.now()})
	if err != nil {
		return CommandResponse{}, ErrDenied
	}
	if err := a.commands.Publish(ctx, state.route, command, a.now()); err != nil {
		return CommandResponse{}, ErrUnavailable
	}
	return CommandResponse{command.CommandId, "accepted"}, nil
}

type controlCommandInput struct {
	commandID, sessionID, deviceID string
	request                        CommandRequest
	now                            time.Time
}

func buildControlCommand(input controlCommandInput) (*pb.ControlCommandEnvelope, error) {
	typeValue := pb.ControlCommandType(pb.ControlCommandType_value["CONTROL_COMMAND_TYPE_"+input.request.Command])
	if typeValue == pb.ControlCommandType_CONTROL_COMMAND_TYPE_UNSPECIFIED {
		return nil, ErrDenied
	}
	command := &pb.ControlCommandEnvelope{CommandId: input.commandID, ControlSessionId: input.sessionID, DeviceId: input.deviceID,
		Sequence: input.request.Sequence, CommandType: typeValue, IssuedUnixMillis: input.now.UnixMilli(), ExpiresUnixMillis: input.now.Add(2 * time.Second).UnixMilli(),
		IdempotencyId: input.request.IdempotencyID}
	if typeValue == pb.ControlCommandType_CONTROL_COMMAND_TYPE_MOTION {
		command.Parameters = &pb.ControlCommandEnvelope_Motion{Motion: &pb.MotionAxes{Forward: input.request.Forward, Right: input.request.Right}}
	}
	return command, nil
}

func randomOpaqueID(prefix string) (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return prefix + hex.EncodeToString(value), nil
}
