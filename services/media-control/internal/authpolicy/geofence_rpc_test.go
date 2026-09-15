package authpolicy

import (
	"context"
	"errors"
	"testing"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mission"
)

func TestMapAllowedAreaPreservesGroupVersionAndPolygonOrder(t *testing.T) {
	result := &pb.AllowedAreaSnapshotOutput{
		GroupId: "co-a", Version: "sha256:fixture",
		Polygons: []*pb.AllowedAreaPolygon{{
			GeofenceId: "fence-a",
			Points: []*pb.AllowedAreaPoint{
				{Latitude: 36.1, Longitude: 128.3},
				{Latitude: 36.2, Longitude: 128.4},
			},
		}},
	}

	snapshot := mapAllowedArea(result)

	if snapshot.GroupID != "co-a" || snapshot.Version != "sha256:fixture" || len(snapshot.Polygons) != 1 {
		t.Fatalf("unexpected snapshot mapping: %#v", snapshot)
	}
	if snapshot.Polygons[0][1].Latitude != 36.2 || snapshot.Polygons[0][1].Longitude != 128.4 {
		t.Fatalf("polygon point order changed: %#v", snapshot.Polygons[0])
	}
}

func TestCurrentAllowedAreaFailsClosedWithoutClientOrGroup(t *testing.T) {
	var client *DeviceRPCClient

	_, err := client.CurrentAllowedArea(context.Background(), "co-a")
	if !errors.Is(err, mission.ErrGeofenceUnavailable) {
		t.Fatalf("expected unavailable nil-client result, got %v", err)
	}
}
