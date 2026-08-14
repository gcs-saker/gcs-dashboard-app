package grpcgateway

import (
	"context"
	"testing"

	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

type recordingTelemetryStore struct {
	calls int
	err   error
}

func (s *recordingTelemetryStore) StoreTelemetry(context.Context, GatewayIdentity, Telemetry) error {
	s.calls++
	return s.err
}

func TestTelemetryHandlerAcceptsOnlyAfterStoreSucceeds(t *testing.T) {
	store := &recordingTelemetryStore{}
	handler := NewTelemetryHandler(store)
	identity := GatewayIdentity{DeviceUUID: "device-1", GroupID: "co-a"}
	ctx := context.WithValue(context.Background(), gatewayIdentityContextKey{}, identity)
	request := GatewayStreamRequest{GroupID: "co-a", AssetID: "device-1", Payload: GatewayStreamRequestPayload{Kind: GatewayPayloadTelemetry, Value: telemetryWire("device-1")}}

	decision := handler.HandleGatewayRequest(ctx, request)

	if decision.Status != GatewayAckStatusAccepted || store.calls != 1 {
		t.Fatalf("expected persisted acceptance, got %+v calls=%d", decision, store.calls)
	}
}

func TestTelemetryHandlerRejectsIdentityMismatchWithoutStore(t *testing.T) {
	store := &recordingTelemetryStore{}
	handler := NewTelemetryHandler(store)
	ctx := context.WithValue(context.Background(), gatewayIdentityContextKey{}, GatewayIdentity{DeviceUUID: "device-1", GroupID: "co-a"})
	request := GatewayStreamRequest{GroupID: "co-a", AssetID: "device-2", Payload: GatewayStreamRequestPayload{Kind: GatewayPayloadTelemetry, Value: telemetryWire("device-2")}}

	decision := handler.HandleGatewayRequest(ctx, request)

	if decision.Status != GatewayAckStatusRejected || decision.ReasonCode != reasonIdentityMismatch || store.calls != 0 {
		t.Fatalf("unexpected decision %+v calls=%d", decision, store.calls)
	}
}

func TestTelemetryHandlerRejectsAuthenticatedGroupMismatchWithoutStore(t *testing.T) {
	store := &recordingTelemetryStore{}
	handler := NewTelemetryHandler(store)
	ctx := context.WithValue(context.Background(), gatewayIdentityContextKey{}, GatewayIdentity{DeviceUUID: "device-1", GroupID: "co-a"})
	request := GatewayStreamRequest{GroupID: "co-b", AssetID: "device-1", Payload: GatewayStreamRequestPayload{Kind: GatewayPayloadTelemetry, Value: telemetryWire("device-1")}}

	decision := handler.HandleGatewayRequest(ctx, request)

	if decision.Status != GatewayAckStatusRejected || decision.ReasonCode != reasonIdentityMismatch || store.calls != 0 {
		t.Fatalf("unexpected decision %+v calls=%d", decision, store.calls)
	}
}

func telemetryWire(assetID string) []byte {
	payload, err := proto.Marshal(&sakerv1.TelemetryEnvelope{
		EventId: "event-1", AssetId: assetID,
		Time:     &sakerv1.Timestamped{ObservedUnixMillis: 1_722_067_200_000},
		Position: &sakerv1.GeoPoint{Latitude: 35.8714, Longitude: 128.6014},
	})
	if err != nil {
		panic(err)
	}
	return payload
}
