package grpcgateway

import (
	"context"
	"math"
	"testing"
	"time"

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

func TestValidateTelemetryRejectsEachInvalidContractFieldGroup(t *testing.T) {
	now := time.UnixMilli(1_722_067_200_000)
	valid := Telemetry{
		EventID: "event-1", AssetID: "device-1", ObservedUnixMillis: now.UnixMilli(),
		Latitude: 35.8714, Longitude: 128.6014, AltitudeM: 42.5, HeadingDeg: 123.4,
		SpeedMPS: 2.1, BatteryPercent: 78.5, RollDeg: 1.2, PitchDeg: -0.4, YawDeg: 123.4,
		LinkQualityPercent: 91,
	}
	tests := []struct {
		name   string
		mutate func(*Telemetry)
	}{
		{name: "identity", mutate: func(value *Telemetry) { value.EventID = " " }},
		{name: "future time", mutate: func(value *Telemetry) { value.ObservedUnixMillis = now.Add(6 * time.Minute).UnixMilli() }},
		{name: "non finite", mutate: func(value *Telemetry) { value.SpeedMPS = math.NaN() }},
		{name: "WGS84", mutate: func(value *Telemetry) { value.Latitude = 91 }},
		{name: "null island", mutate: func(value *Telemetry) { value.Latitude, value.Longitude = 0, 0 }},
		{name: "motion", mutate: func(value *Telemetry) { value.SpeedMPS = 201 }},
		{name: "signal", mutate: func(value *Telemetry) { value.BatteryPercent = 101 }},
		{name: "attitude", mutate: func(value *Telemetry) { value.RollDeg = 361 }},
	}

	if err := ValidateTelemetry(valid, now); err != nil {
		t.Fatalf("valid telemetry rejected: %v", err)
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := valid
			test.mutate(&candidate)
			if err := ValidateTelemetry(candidate, now); err == nil {
				t.Fatal("expected telemetry validation failure")
			}
		})
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
