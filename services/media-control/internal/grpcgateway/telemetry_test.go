package grpcgateway

import (
	"context"
	"encoding/binary"
	"math"
	"testing"
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

func telemetryWire(assetID string) []byte {
	timestamp := encodeVarintField(nil, 1, 1_722_067_200_000)
	position := appendFixed64(nil, 1, 35.8714)
	position = appendFixed64(position, 2, 128.6014)
	payload := encodeString(nil, 1, "event-1")
	payload = encodeString(payload, 4, assetID)
	payload = encodeBytes(payload, 6, timestamp)
	payload = encodeBytes(payload, 7, position)
	return payload
}

func appendFixed64(payload []byte, field int, value float64) []byte {
	payload = encodeKey(payload, field, 1)
	var buffer [8]byte
	binary.LittleEndian.PutUint64(buffer[:], math.Float64bits(value))
	return append(payload, buffer[:]...)
}
