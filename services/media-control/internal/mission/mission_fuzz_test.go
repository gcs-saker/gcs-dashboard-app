package mission

import (
	"testing"
	"time"
)

func FuzzMissionWaypointBoundary(f *testing.F) {
	f.Add(1, 36.1, 128.3, 80.0, 0)
	f.Add(0, 91.0, 181.0, -1000.0, -1)
	now := time.Date(2026, 9, 7, 0, 0, 0, 0, time.UTC)
	f.Fuzz(func(t *testing.T, sequence int, latitude, longitude, altitude float64, hold int) {
		request := DispatchRequest{
			MissionID: "mission", MissionRevision: 1, CommandID: "command", AssetUUID: "asset",
			AssetSessionID: "session", IssuedAt: now.Add(-time.Second), ExpiresAt: now.Add(time.Minute),
			AltitudeDatum: AltitudeAGL, OperatorConfirmed: true,
			Waypoints: []Waypoint{{Sequence: sequence, Latitude: latitude, Longitude: longitude, AltitudeM: altitude, HoldSeconds: hold}},
		}
		_ = validateRequest(request, now)
	})
}
