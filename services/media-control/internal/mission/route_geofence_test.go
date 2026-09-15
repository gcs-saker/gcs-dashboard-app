package mission

import (
	"context"
	"errors"
	"testing"
)

func TestRouteGeofenceAcceptsRouteInsideCurrentAllowedArea(t *testing.T) {
	validator := routeValidator(square())
	waypoints := route(point(2, 2), point(8, 8))

	allowed, err := validator.AllowsRoute(context.Background(), "co-a", "v7", waypoints, AltitudeAGL)

	if err != nil || !allowed {
		t.Fatalf("expected route inside current area, got allowed=%v err=%v", allowed, err)
	}
}

func TestRouteGeofenceRejectsConcaveEscapeBetweenInsideVertices(t *testing.T) {
	polygon := []GeoPoint{point(0, 0), point(6, 0), point(6, 6), point(4, 6), point(4, 2), point(2, 2), point(2, 6), point(0, 6)}
	validator := routeValidator(polygon)

	allowed, err := validator.AllowsRoute(context.Background(), "co-a", "v7", route(point(1, 5), point(5, 5)), AltitudeAGL)

	if err != nil || allowed {
		t.Fatalf("expected concave segment escape rejection, got allowed=%v err=%v", allowed, err)
	}
}

func TestRouteGeofenceAcceptsBoundaryRoute(t *testing.T) {
	validator := routeValidator(square())

	allowed, err := validator.AllowsRoute(context.Background(), "co-a", "v7", route(point(0, 1), point(0, 9)), AltitudeMSL)

	if err != nil || !allowed {
		t.Fatalf("expected allowed-area boundary to be accepted, got allowed=%v err=%v", allowed, err)
	}
}

func TestRouteGeofenceRequiresRouteInsideEveryApprovedArea(t *testing.T) {
	provider := areaProviderStub{snapshot: AllowedAreaSnapshot{
		GroupID: "co-a", Version: "v7", Polygons: [][]GeoPoint{square(), {
			point(1, 1), point(1, 6), point(6, 6), point(6, 1),
		}},
	}}
	validator := RouteGeofence{Provider: provider}

	allowed, err := validator.AllowsRoute(context.Background(), "co-a", "v7", route(point(2, 2), point(8, 8)), AltitudeAGL)

	if err != nil || allowed {
		t.Fatalf("expected intersection-of-approved-areas rejection, got allowed=%v err=%v", allowed, err)
	}
}

func TestRouteGeofenceRejectsStaleVersionBeforeGeometry(t *testing.T) {
	validator := routeValidator(square())

	allowed, err := validator.AllowsRoute(context.Background(), "co-a", "v6", route(point(2, 2)), AltitudeAGL)

	if allowed || !errors.Is(err, ErrGeofenceVersionStale) {
		t.Fatalf("expected stale version, got allowed=%v err=%v", allowed, err)
	}
}

func TestRouteGeofenceFailsClosedForProviderAndIdentityErrors(t *testing.T) {
	cases := []struct {
		name     string
		provider AllowedAreaProvider
		groupID  string
		want     error
	}{
		{"provider unavailable", areaProviderStub{err: errors.New("down")}, "co-a", ErrGeofenceUnavailable},
		{"wrong group", areaProviderStub{snapshot: snapshot("co-b", square())}, "co-a", ErrGeofenceInvalid},
		{"missing provider", nil, "co-a", ErrGeofenceUnavailable},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			validator := RouteGeofence{Provider: test.provider}
			allowed, err := validator.AllowsRoute(context.Background(), test.groupID, "v7", route(point(2, 2)), AltitudeAGL)
			if allowed || !errors.Is(err, test.want) {
				t.Fatalf("expected %v, got allowed=%v err=%v", test.want, allowed, err)
			}
		})
	}
}

func TestRouteGeofenceRejectsInvalidGeometry(t *testing.T) {
	cases := []struct {
		name    string
		polygon []GeoPoint
	}{
		{"too few points", []GeoPoint{point(0, 0), point(1, 1)}},
		{"self intersection", []GeoPoint{point(0, 0), point(4, 4), point(0, 4), point(4, 0)}},
		{"zero area", []GeoPoint{point(0, 0), point(1, 1), point(2, 2)}},
		{"antimeridian ambiguity", []GeoPoint{point(0, 179), point(1, -179), point(2, 179)}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			allowed, err := routeValidator(test.polygon).AllowsRoute(
				context.Background(), "co-a", "v7", route(point(1, 1)), AltitudeAGL,
			)
			if allowed || !errors.Is(err, ErrGeofenceInvalid) {
				t.Fatalf("expected invalid geometry, got allowed=%v err=%v", allowed, err)
			}
		})
	}
}

func TestRouteGeofenceDoesNotMutateProviderSnapshot(t *testing.T) {
	polygon := append(square(), square()[0])
	validator := routeValidator(polygon)

	_, _ = validator.AllowsRoute(context.Background(), "co-a", "v7", route(point(2, 2)), AltitudeAGL)

	if len(polygon) != 5 {
		t.Fatalf("expected provider-owned polygon to remain unchanged, got %d points", len(polygon))
	}
}

type areaProviderStub struct {
	snapshot AllowedAreaSnapshot
	err      error
}

func (s areaProviderStub) CurrentAllowedArea(_ context.Context, _ string) (AllowedAreaSnapshot, error) {
	return s.snapshot, s.err
}

func routeValidator(polygon []GeoPoint) RouteGeofence {
	return RouteGeofence{Provider: areaProviderStub{snapshot: snapshot("co-a", polygon)}}
}

func snapshot(groupID string, polygon []GeoPoint) AllowedAreaSnapshot {
	return AllowedAreaSnapshot{GroupID: groupID, Version: "v7", Polygons: [][]GeoPoint{polygon}}
}

func square() []GeoPoint {
	return []GeoPoint{point(0, 0), point(0, 10), point(10, 10), point(10, 0)}
}

func route(points ...GeoPoint) []Waypoint {
	waypoints := make([]Waypoint, len(points))
	for index, current := range points {
		waypoints[index] = Waypoint{Sequence: index + 1, Latitude: current.Latitude, Longitude: current.Longitude}
	}
	return waypoints
}

func point(latitude, longitude float64) GeoPoint {
	return GeoPoint{Latitude: latitude, Longitude: longitude}
}
