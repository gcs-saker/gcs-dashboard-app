package mission

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestDispatchUsesServerOwnedSessionGroup(t *testing.T) {
	service, request := fixture()
	envelope, err := service.Dispatch(context.Background(), "operator-a", request)
	if err != nil || envelope.GroupID != "co-a" {
		t.Fatalf("expected server-owned group dispatch, got %#v %v", envelope, err)
	}
}

func TestDispatchFailsClosedForUnsafeRequests(t *testing.T) {
	cases := []struct {
		name string
		edit func(*Service, *DispatchRequest)
		want error
	}{
		{"confirmation", func(_ *Service, r *DispatchRequest) { r.OperatorConfirmed = false }, ErrConfirmation},
		{"expired", func(s *Service, r *DispatchRequest) { r.ExpiresAt = s.Now().Add(-time.Second) }, ErrCommandExpired},
		{"stale session", func(_ *Service, r *DispatchRequest) { r.AssetSessionID = "old-session" }, ErrSessionMismatch},
		{"wrong asset", func(_ *Service, r *DispatchRequest) { r.AssetUUID = "asset-b" }, ErrSessionMismatch},
		{"cross group", func(s *Service, _ *DispatchRequest) { s.Policy = policyStub{allowed: false} }, ErrAccessDenied},
		{"segment violation", func(s *Service, _ *DispatchRequest) { s.Geofence = geofenceStub{allowed: false} }, ErrGeofenceViolation},
		{"stale geofence", func(s *Service, _ *DispatchRequest) { s.Geofence = geofenceStub{err: ErrGeofenceVersionStale} }, ErrGeofenceVersionStale},
		{"duplicate", func(s *Service, _ *DispatchRequest) { s.Commands = ledgerStub{reserved: false} }, ErrDuplicateCommand},
		{"ledger unavailable", func(s *Service, _ *DispatchRequest) { s.Commands = ledgerStub{err: errors.New("store down")} }, ErrCommandLedgerUnavailable},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			service, request := fixture()
			test.edit(&service, &request)
			_, err := service.Dispatch(context.Background(), "operator-a", request)
			if err != test.want {
				t.Fatalf("expected %v, got %v", test.want, err)
			}
		})
	}
}

func TestDispatchValidatesOrderedBoundedWaypoints(t *testing.T) {
	service, request := fixture()
	request.Waypoints[0].Sequence = 2
	if _, err := service.Dispatch(context.Background(), "operator-a", request); err != ErrInvalidMission {
		t.Fatalf("expected invalid mission, got %v", err)
	}
}

func TestDispatchRequiresGeofenceVersionAndBoundedLifetime(t *testing.T) {
	service, request := fixture()
	request.GeofenceVersion = ""
	if _, err := service.Dispatch(context.Background(), "operator-a", request); err != ErrInvalidMission {
		t.Fatalf("expected missing version rejection, got %v", err)
	}
	request.GeofenceVersion = "geofence-v1"
	request.ExpiresAt = request.IssuedAt.Add(MaxCommandLifetime + time.Second)
	if _, err := service.Dispatch(context.Background(), "operator-a", request); err != ErrCommandExpired {
		t.Fatalf("expected excessive lifetime rejection, got %v", err)
	}
}

func TestMissionLifetimeAcceptsExactMaximumAndRejectsOneNanosecondBeyond(t *testing.T) {
	service, request := fixture()
	request.IssuedAt = service.Now()
	request.ExpiresAt = request.IssuedAt.Add(MaxCommandLifetime)
	if _, err := service.Dispatch(context.Background(), "operator-a", request); err != nil {
		t.Fatalf("exact maximum lifetime rejected: %v", err)
	}
	request.ExpiresAt = request.IssuedAt.Add(MaxCommandLifetime + time.Nanosecond)
	if _, err := service.Dispatch(context.Background(), "operator-a", request); err != ErrCommandExpired {
		t.Fatalf("lifetime beyond maximum error=%v", err)
	}
}

func TestWaypointCountAndCoordinateBoundaries(t *testing.T) {
	now := time.Now()
	request := fixtureRequest(now)
	for _, waypoint := range []Waypoint{
		{Sequence: 1, Latitude: -90, Longitude: -180},
		{Sequence: 1, Latitude: 90, Longitude: 180, HoldSeconds: 3600},
	} {
		request.Waypoints = []Waypoint{waypoint}
		if err := validateRequest(request, now); err != nil {
			t.Fatalf("coordinate boundary rejected: %#v err=%v", waypoint, err)
		}
	}
	for _, waypoint := range []Waypoint{
		{Sequence: 1, Latitude: -90.000001},
		{Sequence: 1, Latitude: 90.000001},
		{Sequence: 1, Longitude: -180.000001},
		{Sequence: 1, Longitude: 180.000001},
		{Sequence: 1, HoldSeconds: -1},
		{Sequence: 1, HoldSeconds: 3601},
	} {
		request.Waypoints = []Waypoint{waypoint}
		if err := validateRequest(request, now); err != ErrInvalidMission {
			t.Fatalf("coordinate outside boundary error=%v waypoint=%#v", err, waypoint)
		}
	}
	request.Waypoints = make([]Waypoint, 200)
	for index := range request.Waypoints {
		request.Waypoints[index] = Waypoint{Sequence: index + 1}
	}
	if err := validateRequest(request, now); err != nil {
		t.Fatalf("200 waypoints rejected: %v", err)
	}
	request.Waypoints = append(request.Waypoints, Waypoint{Sequence: 201})
	if err := validateRequest(request, now); err != ErrInvalidMission {
		t.Fatalf("201 waypoints error=%v", err)
	}
	request.Waypoints = nil
	if err := validateRequest(request, now); err != ErrInvalidMission {
		t.Fatalf("empty waypoints error=%v", err)
	}
}

func fixtureRequest(now time.Time) DispatchRequest {
	return DispatchRequest{
		MissionID: "mission-boundary", MissionRevision: 1, CommandID: "command-boundary",
		AssetUUID: "asset-a", AssetSessionID: "session-a", IssuedAt: now,
		ExpiresAt: now.Add(time.Minute), AltitudeDatum: AltitudeAGL,
		GeofenceVersion: "geofence-v1", OperatorConfirmed: true,
		Waypoints: []Waypoint{{Sequence: 1}},
	}
}

func fixture() (Service, DispatchRequest) {
	now := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	request := DispatchRequest{
		MissionID: "mission-1", MissionRevision: 1, CommandID: "550e8400-e29b-41d4-a716-446655440000",
		AssetUUID: "asset-a", AssetSessionID: "session-a", IssuedAt: now.Add(-time.Second),
		ExpiresAt: now.Add(time.Minute), AltitudeDatum: AltitudeAGL, GeofenceVersion: "geofence-v1", OperatorConfirmed: true,
		Waypoints: []Waypoint{{Sequence: 1, Latitude: 36.1, Longitude: 128.3, AltitudeM: 80, Action: "PASS"}},
	}
	service := Service{
		Sessions: sessionStub{session: ActiveAssetSession{SessionID: "session-a", AssetUUID: "asset-a", GroupID: "co-a", Active: true}},
		Policy:   policyStub{allowed: true}, Geofence: geofenceStub{allowed: true},
		Commands: ledgerStub{reserved: true}, Now: func() time.Time { return now },
	}
	return service, request
}

type sessionStub struct{ session ActiveAssetSession }

func (s sessionStub) ResolveActiveSession(_ context.Context, _ string) (ActiveAssetSession, error) {
	return s.session, nil
}

type policyStub struct{ allowed bool }

func (s policyStub) CanControl(_ context.Context, _, _ string) (bool, error) { return s.allowed, nil }

type geofenceStub struct {
	allowed bool
	err     error
}

func (s geofenceStub) AllowsRoute(_ context.Context, _, _ string, _ []Waypoint, _ AltitudeDatum) (bool, error) {
	return s.allowed, s.err
}

type ledgerStub struct {
	reserved bool
	err      error
}

func (s ledgerStub) Reserve(_ context.Context, _ string, _ time.Time) (bool, error) {
	return s.reserved, s.err
}
