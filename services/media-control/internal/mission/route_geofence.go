package mission

import (
	"context"
	"errors"
	"math"
	"sort"
)

var (
	ErrGeofenceUnavailable = errors.New("mission_geofence_unavailable")
	ErrGeofenceInvalid     = errors.New("mission_geofence_invalid")
)

const geometryEpsilon = 1e-10

type GeoPoint struct {
	Latitude  float64
	Longitude float64
}

type AllowedAreaSnapshot struct {
	GroupID  string
	Version  string
	Polygons [][]GeoPoint
}

type AllowedAreaProvider interface {
	CurrentAllowedArea(context.Context, string) (AllowedAreaSnapshot, error)
}

type RouteGeofence struct {
	Provider AllowedAreaProvider
}

func (g RouteGeofence) AllowsRoute(
	ctx context.Context,
	groupID string,
	requestedVersion string,
	waypoints []Waypoint,
	_ AltitudeDatum,
) (bool, error) {
	polygons, err := g.currentPolygons(ctx, groupID, requestedVersion)
	if err != nil {
		return false, err
	}
	return routeInsideAll(waypoints, polygons)
}

func (g RouteGeofence) currentPolygons(
	ctx context.Context,
	groupID string,
	requestedVersion string,
) ([][]GeoPoint, error) {
	if g.Provider == nil || groupID == "" || requestedVersion == "" {
		return nil, ErrGeofenceUnavailable
	}
	snapshot, err := g.Provider.CurrentAllowedArea(ctx, groupID)
	if err != nil {
		return nil, ErrGeofenceUnavailable
	}
	if snapshot.GroupID != groupID || snapshot.Version == "" {
		return nil, ErrGeofenceInvalid
	}
	if snapshot.Version != requestedVersion {
		return nil, ErrGeofenceVersionStale
	}
	if len(snapshot.Polygons) == 0 {
		return nil, ErrGeofenceInvalid
	}
	return snapshot.Polygons, nil
}

func routeInsideAll(waypoints []Waypoint, candidates [][]GeoPoint) (bool, error) {
	for _, candidate := range candidates {
		polygon, err := validatedPolygon(candidate)
		if err != nil || !routeInsidePolygon(waypoints, polygon) {
			return false, err
		}
	}
	return true, nil
}

func validatedPolygon(points []GeoPoint) ([]GeoPoint, error) {
	polygon := append([]GeoPoint(nil), points...)
	if len(polygon) > 1 && samePoint(polygon[0], polygon[len(polygon)-1]) {
		polygon = polygon[:len(polygon)-1]
	}
	if len(polygon) < 3 || !validCoordinates(polygon) || hasDegenerateEdge(polygon) ||
		math.Abs(signedArea(polygon)) <= geometryEpsilon || selfIntersects(polygon) {
		return nil, ErrGeofenceInvalid
	}
	return polygon, nil
}

func signedArea(polygon []GeoPoint) float64 {
	area := 0.0
	for index, point := range polygon {
		next := polygon[(index+1)%len(polygon)]
		area += point.Longitude*next.Latitude - next.Longitude*point.Latitude
	}
	return area / 2
}

func validCoordinates(points []GeoPoint) bool {
	for _, point := range points {
		if math.IsNaN(point.Latitude) || math.IsNaN(point.Longitude) || math.IsInf(point.Latitude, 0) ||
			math.IsInf(point.Longitude, 0) || point.Latitude < -90 || point.Latitude > 90 ||
			point.Longitude < -180 || point.Longitude > 180 {
			return false
		}
	}
	return longitudeSpan(points) <= 180
}

func longitudeSpan(points []GeoPoint) float64 {
	minimum, maximum := points[0].Longitude, points[0].Longitude
	for _, point := range points[1:] {
		minimum = math.Min(minimum, point.Longitude)
		maximum = math.Max(maximum, point.Longitude)
	}
	return maximum - minimum
}

func hasDegenerateEdge(polygon []GeoPoint) bool {
	for index, start := range polygon {
		if samePoint(start, polygon[(index+1)%len(polygon)]) {
			return true
		}
	}
	return false
}

func selfIntersects(polygon []GeoPoint) bool {
	for first := range polygon {
		for second := first + 1; second < len(polygon); second++ {
			if adjacentEdges(first, second, len(polygon)) {
				continue
			}
			if segmentsIntersect(polygon[first], polygon[(first+1)%len(polygon)], polygon[second], polygon[(second+1)%len(polygon)]) {
				return true
			}
		}
	}
	return false
}

func adjacentEdges(first, second, size int) bool {
	return second == first+1 || (first == 0 && second == size-1)
}

func routeInsidePolygon(waypoints []Waypoint, polygon []GeoPoint) bool {
	points := make([]GeoPoint, len(waypoints))
	for index, waypoint := range waypoints {
		points[index] = GeoPoint{Latitude: waypoint.Latitude, Longitude: waypoint.Longitude}
		if !pointInsideOrBoundary(points[index], polygon) {
			return false
		}
	}
	for index := 1; index < len(points); index++ {
		if !segmentInsidePolygon(points[index-1], points[index], polygon) {
			return false
		}
	}
	return true
}

func segmentInsidePolygon(start, end GeoPoint, polygon []GeoPoint) bool {
	parameters := []float64{0, 1}
	for index, edgeStart := range polygon {
		edgeEnd := polygon[(index+1)%len(polygon)]
		parameters = append(parameters, intersectionParameters(start, end, edgeStart, edgeEnd)...)
	}
	sort.Float64s(parameters)
	for index := 1; index < len(parameters); index++ {
		left, right := parameters[index-1], parameters[index]
		if right-left <= geometryEpsilon {
			continue
		}
		if !pointInsideOrBoundary(interpolate(start, end, (left+right)/2), polygon) {
			return false
		}
	}
	return true
}

func intersectionParameters(start, end, edgeStart, edgeEnd GeoPoint) []float64 {
	direction := subtract(end, start)
	edgeDirection := subtract(edgeEnd, edgeStart)
	denominator := cross(direction, edgeDirection)
	offset := subtract(edgeStart, start)
	if math.Abs(denominator) <= geometryEpsilon {
		if math.Abs(cross(offset, direction)) > geometryEpsilon {
			return nil
		}
		return collinearParameters(start, end, edgeStart, edgeEnd)
	}
	t := cross(offset, edgeDirection) / denominator
	u := cross(offset, direction) / denominator
	if t < -geometryEpsilon || t > 1+geometryEpsilon || u < -geometryEpsilon || u > 1+geometryEpsilon {
		return nil
	}
	return []float64{clampUnit(t)}
}

func collinearParameters(start, end, edgeStart, edgeEnd GeoPoint) []float64 {
	direction := subtract(end, start)
	lengthSquared := dot(direction, direction)
	if lengthSquared <= geometryEpsilon {
		return nil
	}
	first := dot(subtract(edgeStart, start), direction) / lengthSquared
	second := dot(subtract(edgeEnd, start), direction) / lengthSquared
	low, high := math.Max(0, math.Min(first, second)), math.Min(1, math.Max(first, second))
	if low > high+geometryEpsilon {
		return nil
	}
	return []float64{clampUnit(low), clampUnit(high)}
}

func pointInsideOrBoundary(point GeoPoint, polygon []GeoPoint) bool {
	inside := false
	previous := polygon[len(polygon)-1]
	for _, current := range polygon {
		if pointOnSegment(point, previous, current) {
			return true
		}
		crosses := (current.Latitude > point.Latitude) != (previous.Latitude > point.Latitude)
		if crosses {
			longitude := (previous.Longitude-current.Longitude)*(point.Latitude-current.Latitude)/
				(previous.Latitude-current.Latitude) + current.Longitude
			if point.Longitude < longitude {
				inside = !inside
			}
		}
		previous = current
	}
	return inside
}

func segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd GeoPoint) bool {
	return len(intersectionParameters(firstStart, firstEnd, secondStart, secondEnd)) > 0
}

func pointOnSegment(point, start, end GeoPoint) bool {
	if math.Abs(cross(subtract(point, start), subtract(end, start))) > geometryEpsilon {
		return false
	}
	return point.Latitude >= math.Min(start.Latitude, end.Latitude)-geometryEpsilon &&
		point.Latitude <= math.Max(start.Latitude, end.Latitude)+geometryEpsilon &&
		point.Longitude >= math.Min(start.Longitude, end.Longitude)-geometryEpsilon &&
		point.Longitude <= math.Max(start.Longitude, end.Longitude)+geometryEpsilon
}

func subtract(left, right GeoPoint) GeoPoint {
	return GeoPoint{Latitude: left.Latitude - right.Latitude, Longitude: left.Longitude - right.Longitude}
}

func cross(left, right GeoPoint) float64 {
	return left.Longitude*right.Latitude - left.Latitude*right.Longitude
}

func dot(left, right GeoPoint) float64 {
	return left.Latitude*right.Latitude + left.Longitude*right.Longitude
}

func interpolate(start, end GeoPoint, parameter float64) GeoPoint {
	return GeoPoint{
		Latitude:  start.Latitude + (end.Latitude-start.Latitude)*parameter,
		Longitude: start.Longitude + (end.Longitude-start.Longitude)*parameter,
	}
}

func samePoint(left, right GeoPoint) bool {
	return math.Abs(left.Latitude-right.Latitude) <= geometryEpsilon &&
		math.Abs(left.Longitude-right.Longitude) <= geometryEpsilon
}

func clampUnit(value float64) float64 {
	return math.Max(0, math.Min(1, value))
}
