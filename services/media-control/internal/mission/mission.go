package mission

import (
	"context"
	"errors"
	"time"
)

var (
	ErrInvalidMission    = errors.New("mission_invalid")
	ErrConfirmation      = errors.New("operator_confirmation_required")
	ErrCommandExpired    = errors.New("mission_command_expired")
	ErrSessionMismatch   = errors.New("mission_session_mismatch")
	ErrAccessDenied      = errors.New("mission_access_denied")
	ErrGeofenceViolation = errors.New("mission_geofence_violation")
	ErrDuplicateCommand  = errors.New("mission_command_duplicate")
)

type AltitudeDatum string

const (
	AltitudeAGL AltitudeDatum = "AGL"
	AltitudeMSL AltitudeDatum = "MSL"
)

type Waypoint struct {
	Sequence    int
	Latitude    float64
	Longitude   float64
	AltitudeM   float64
	HoldSeconds int
	Action      string
}

type DispatchRequest struct {
	MissionID         string
	MissionRevision   int64
	CommandID         string
	AssetUUID         string
	AssetSessionID    string
	IssuedAt          time.Time
	ExpiresAt         time.Time
	AltitudeDatum     AltitudeDatum
	OperatorConfirmed bool
	Waypoints         []Waypoint
}

type ActiveAssetSession struct {
	SessionID string
	AssetUUID string
	GroupID   string
	Active    bool
}

type DispatchEnvelope struct {
	Request DispatchRequest
	GroupID string
}

type SessionResolver interface {
	ResolveActiveSession(context.Context, string) (ActiveAssetSession, error)
}

type Authorizer interface {
	CanControl(context.Context, string, string) (bool, error)
}

type Geofence interface {
	AllowsRoute(context.Context, []Waypoint, AltitudeDatum) (bool, error)
}

type CommandLedger interface {
	Reserve(context.Context, string, time.Time) (bool, error)
}

type Service struct {
	Sessions SessionResolver
	Policy   Authorizer
	Geofence Geofence
	Commands CommandLedger
	Now      func() time.Time
}

func (s Service) Dispatch(ctx context.Context, principal string, request DispatchRequest) (DispatchEnvelope, error) {
	if err := validateRequest(request, s.Now()); err != nil {
		return DispatchEnvelope{}, err
	}
	session, err := s.Sessions.ResolveActiveSession(ctx, request.AssetSessionID)
	if err != nil || !session.Active || session.AssetUUID != request.AssetUUID || session.SessionID != request.AssetSessionID {
		return DispatchEnvelope{}, ErrSessionMismatch
	}
	allowed, err := s.Policy.CanControl(ctx, principal, session.GroupID)
	if err != nil || !allowed {
		return DispatchEnvelope{}, ErrAccessDenied
	}
	inside, err := s.Geofence.AllowsRoute(ctx, request.Waypoints, request.AltitudeDatum)
	if err != nil || !inside {
		return DispatchEnvelope{}, ErrGeofenceViolation
	}
	reserved, err := s.Commands.Reserve(ctx, request.CommandID, request.ExpiresAt)
	if err != nil || !reserved {
		return DispatchEnvelope{}, ErrDuplicateCommand
	}
	return DispatchEnvelope{Request: request, GroupID: session.GroupID}, nil
}

func validateRequest(request DispatchRequest, now time.Time) error {
	if request.MissionID == "" || request.MissionRevision < 1 || request.CommandID == "" || request.AssetUUID == "" || request.AssetSessionID == "" {
		return ErrInvalidMission
	}
	if !request.OperatorConfirmed {
		return ErrConfirmation
	}
	if request.IssuedAt.After(now) || !request.ExpiresAt.After(now) || !request.ExpiresAt.After(request.IssuedAt) {
		return ErrCommandExpired
	}
	if request.AltitudeDatum != AltitudeAGL && request.AltitudeDatum != AltitudeMSL {
		return ErrInvalidMission
	}
	if len(request.Waypoints) == 0 || len(request.Waypoints) > 200 {
		return ErrInvalidMission
	}
	for index, waypoint := range request.Waypoints {
		if waypoint.Sequence != index+1 || waypoint.Latitude < -90 || waypoint.Latitude > 90 || waypoint.Longitude < -180 || waypoint.Longitude > 180 || waypoint.HoldSeconds < 0 || waypoint.HoldSeconds > 3600 {
			return ErrInvalidMission
		}
	}
	return nil
}
