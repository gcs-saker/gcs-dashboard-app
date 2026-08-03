package grpcgateway

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"strings"
	"time"
)

type Telemetry struct {
	EventID            string
	AssetID            string
	ObservedUnixMillis int64
	Latitude           float64
	Longitude          float64
	AltitudeM          float64
	HeadingDeg         float64
	SpeedMPS           float64
	BatteryPercent     float64
	RollDeg            float64
	PitchDeg           float64
	YawDeg             float64
	LinkQualityPercent float64
}

type TelemetryStore interface {
	StoreTelemetry(context.Context, GatewayIdentity, Telemetry) error
}

type TelemetryHandler struct{ store TelemetryStore }

func NewTelemetryHandler(store TelemetryStore) TelemetryHandler {
	return TelemetryHandler{store: store}
}

func (h TelemetryHandler) HandleGatewayRequest(ctx context.Context, request GatewayStreamRequest) GatewayRequestDecision {
	identity, ok := GatewayIdentityFromContext(ctx)
	if !ok || request.AssetID != identity.DeviceUUID || request.GroupID != identity.GroupID {
		return GatewayRequestDecision{Status: GatewayAckStatusRejected, ReasonCode: reasonIdentityMismatch}
	}
	if request.Payload.Kind != GatewayPayloadTelemetry || h.store == nil {
		return GatewayRequestDecision{Status: GatewayAckStatusBackpressure, ReasonCode: reasonStoreFailed}
	}
	telemetry, err := DecodeTelemetry(request.Payload.Value)
	if err != nil {
		return GatewayRequestDecision{Status: GatewayAckStatusRejected, ReasonCode: reasonMalformed}
	}
	if telemetry.AssetID != identity.DeviceUUID {
		return GatewayRequestDecision{Status: GatewayAckStatusRejected, ReasonCode: reasonIdentityMismatch}
	}
	if err := ValidateTelemetry(telemetry, time.Now()); err != nil {
		return GatewayRequestDecision{Status: GatewayAckStatusRejected, ReasonCode: reasonSemanticInvalid}
	}
	if err := h.store.StoreTelemetry(ctx, identity, telemetry); err != nil {
		return GatewayRequestDecision{Status: GatewayAckStatusBackpressure, ReasonCode: reasonStoreFailed}
	}
	return GatewayRequestDecision{Status: GatewayAckStatusAccepted, ReasonCode: reasonAccepted}
}

func ValidateTelemetry(v Telemetry, now time.Time) error {
	if strings.TrimSpace(v.EventID) == "" || strings.TrimSpace(v.AssetID) == "" || v.ObservedUnixMillis <= 0 {
		return fmt.Errorf("required identity or time missing")
	}
	observed := time.UnixMilli(v.ObservedUnixMillis)
	if observed.After(now.Add(5 * time.Minute)) {
		return fmt.Errorf("observed time exceeds future skew")
	}
	values := []float64{v.Latitude, v.Longitude, v.AltitudeM, v.HeadingDeg, v.SpeedMPS,
		v.BatteryPercent, v.RollDeg, v.PitchDeg, v.YawDeg, v.LinkQualityPercent}
	for _, value := range values {
		if math.IsNaN(value) || math.IsInf(value, 0) { return fmt.Errorf("non-finite telemetry") }
	}
	if v.Latitude < -90 || v.Latitude > 90 || v.Longitude < -180 || v.Longitude > 180 {
		return fmt.Errorf("position outside WGS84")
	}
	if v.Latitude == 0 && v.Longitude == 0 { return fmt.Errorf("null-island position rejected") }
	if v.AltitudeM < -500 || v.AltitudeM > 20000 || v.SpeedMPS < 0 || v.SpeedMPS > 200 {
		return fmt.Errorf("altitude or speed outside contract")
	}
	if v.HeadingDeg < 0 || v.HeadingDeg >= 360 || v.BatteryPercent < 0 || v.BatteryPercent > 100 ||
		v.LinkQualityPercent < 0 || v.LinkQualityPercent > 100 {
		return fmt.Errorf("heading or percentage outside contract")
	}
	for _, angle := range []float64{v.RollDeg, v.PitchDeg, v.YawDeg} {
		if angle < -360 || angle > 360 { return fmt.Errorf("attitude outside contract") }
	}
	return nil
}

type protobufFields struct {
	bytes   map[int][][]byte
	varints map[int][]uint64
	fixed64 map[int][]uint64
}

func DecodeTelemetry(payload []byte) (Telemetry, error) {
	fields, err := decodeProtobufFields(payload)
	if err != nil {
		return Telemetry{}, err
	}
	timeFields, err := nestedFields(fields, 6)
	if err != nil {
		return Telemetry{}, err
	}
	position, err := nestedFields(fields, 7)
	if err != nil {
		return Telemetry{}, err
	}
	attitude, _ := optionalNestedFields(fields, 13)
	telemetry := Telemetry{
		EventID: requiredText(fields, 1), AssetID: requiredText(fields, 4),
		ObservedUnixMillis: int64(firstVarint(timeFields, 1)),
		Latitude:           firstDouble(position, 1), Longitude: firstDouble(position, 2), AltitudeM: firstDouble(position, 3),
		HeadingDeg: firstDouble(fields, 8), SpeedMPS: firstDouble(fields, 9), BatteryPercent: firstDouble(fields, 10),
		RollDeg: firstDouble(attitude, 1), PitchDeg: firstDouble(attitude, 2), YawDeg: firstDouble(attitude, 3),
		LinkQualityPercent: firstDouble(fields, 16),
	}
	if telemetry.EventID == "" || telemetry.AssetID == "" || telemetry.ObservedUnixMillis <= 0 {
		return Telemetry{}, fmt.Errorf("required telemetry identity or timestamp is missing")
	}
	return telemetry, nil
}

func decodeProtobufFields(payload []byte) (protobufFields, error) {
	result := protobufFields{bytes: map[int][][]byte{}, varints: map[int][]uint64{}, fixed64: map[int][]uint64{}}
	for cursor := 0; cursor < len(payload); {
		key, next, err := readVarint(payload, cursor)
		if err != nil {
			return result, err
		}
		cursor = next
		field, wire := int(key>>3), int(key&7)
		switch wire {
		case 0:
			value, next, err := readVarint(payload, cursor)
			if err != nil {
				return result, err
			}
			cursor = next
			result.varints[field] = append(result.varints[field], value)
		case 1:
			if cursor+8 > len(payload) {
				return result, fmt.Errorf("fixed64 exceeds payload")
			}
			result.fixed64[field] = append(result.fixed64[field], binary.LittleEndian.Uint64(payload[cursor:cursor+8]))
			cursor += 8
		case 2:
			length, next, err := readVarint(payload, cursor)
			if err != nil {
				return result, err
			}
			cursor = next
			end := cursor + int(length)
			if end > len(payload) {
				return result, fmt.Errorf("field exceeds payload")
			}
			result.bytes[field] = append(result.bytes[field], append([]byte(nil), payload[cursor:end]...))
			cursor = end
		default:
			return result, fmt.Errorf("unsupported telemetry wire type %d", wire)
		}
	}
	return result, nil
}

func nestedFields(fields protobufFields, field int) (protobufFields, error) {
	values := fields.bytes[field]
	if len(values) != 1 {
		return protobufFields{}, fmt.Errorf("field %d must occur once", field)
	}
	return decodeProtobufFields(values[0])
}
func optionalNestedFields(fields protobufFields, field int) (protobufFields, error) {
	values := fields.bytes[field]
	if len(values) == 0 {
		return protobufFields{bytes: map[int][][]byte{}, varints: map[int][]uint64{}, fixed64: map[int][]uint64{}}, nil
	}
	if len(values) != 1 {
		return protobufFields{}, fmt.Errorf("field %d must occur at most once", field)
	}
	return decodeProtobufFields(values[0])
}
func requiredText(fields protobufFields, field int) string {
	if len(fields.bytes[field]) != 1 {
		return ""
	}
	return string(fields.bytes[field][0])
}
func firstVarint(fields protobufFields, field int) uint64 {
	if len(fields.varints[field]) == 0 {
		return 0
	}
	return fields.varints[field][0]
}
func firstDouble(fields protobufFields, field int) float64 {
	if len(fields.fixed64[field]) == 0 {
		return 0
	}
	return math.Float64frombits(fields.fixed64[field][0])
}
