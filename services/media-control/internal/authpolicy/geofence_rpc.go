package authpolicy

import (
	"context"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mission"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (c *DeviceRPCClient) CurrentAllowedArea(ctx context.Context, groupID string) (mission.AllowedAreaSnapshot, error) {
	if c == nil || groupID == "" {
		return mission.AllowedAreaSnapshot{}, mission.ErrGeofenceUnavailable
	}
	requestContext, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := pb.NewMediaPolicyServiceClient(c.connection).CurrentAllowedArea(
		requestContext,
		&pb.GroupScopeInput{GroupId: groupID},
	)
	if status.Code(err) == codes.InvalidArgument {
		return mission.AllowedAreaSnapshot{}, mission.ErrGeofenceInvalid
	}
	if err != nil {
		return mission.AllowedAreaSnapshot{}, mission.ErrGeofenceUnavailable
	}
	return mapAllowedArea(result), nil
}

func mapAllowedArea(result *pb.AllowedAreaSnapshotOutput) mission.AllowedAreaSnapshot {
	polygons := make([][]mission.GeoPoint, len(result.GetPolygons()))
	for polygonIndex, polygon := range result.GetPolygons() {
		points := make([]mission.GeoPoint, len(polygon.GetPoints()))
		for pointIndex, point := range polygon.GetPoints() {
			points[pointIndex] = mission.GeoPoint{Latitude: point.GetLatitude(), Longitude: point.GetLongitude()}
		}
		polygons[polygonIndex] = points
	}
	return mission.AllowedAreaSnapshot{GroupID: result.GetGroupId(), Version: result.GetVersion(), Polygons: polygons}
}
