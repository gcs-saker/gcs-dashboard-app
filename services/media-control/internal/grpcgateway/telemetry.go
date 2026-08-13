package grpcgateway

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
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
		if math.IsNaN(value) || math.IsInf(value, 0) {
			return fmt.Errorf("non-finite telemetry")
		}
	}
	if v.Latitude < -90 || v.Latitude > 90 || v.Longitude < -180 || v.Longitude > 180 {
		return fmt.Errorf("position outside WGS84")
	}
	if v.Latitude == 0 && v.Longitude == 0 {
		return fmt.Errorf("null-island position rejected")
	}
	if v.AltitudeM < -500 || v.AltitudeM > 20000 || v.SpeedMPS < 0 || v.SpeedMPS > 200 {
		return fmt.Errorf("altitude or speed outside contract")
	}
	if v.HeadingDeg < 0 || v.HeadingDeg >= 360 || v.BatteryPercent < 0 || v.BatteryPercent > 100 ||
		v.LinkQualityPercent < 0 || v.LinkQualityPercent > 100 {
		return fmt.Errorf("heading or percentage outside contract")
	}
	for _, angle := range []float64{v.RollDeg, v.PitchDeg, v.YawDeg} {
		if angle < -360 || angle > 360 {
			return fmt.Errorf("attitude outside contract")
		}
	}
	return nil
}

func DecodeTelemetry(payload []byte) (Telemetry, error) {
	message := &sakerv1.TelemetryEnvelope{}
	if err := proto.Unmarshal(payload, message); err != nil {
		return Telemetry{}, err
	}
	if message.GetTime() == nil || message.GetPosition() == nil {
		return Telemetry{}, fmt.Errorf("telemetry time and position are required")
	}
	attitude := message.GetAttitudeDeg()
	telemetry := Telemetry{
		EventID: message.GetEventId(), AssetID: message.GetAssetId(), ObservedUnixMillis: message.GetTime().GetObservedUnixMillis(),
		Latitude: message.GetPosition().GetLatitude(), Longitude: message.GetPosition().GetLongitude(), AltitudeM: message.GetPosition().GetAltitudeM(),
		HeadingDeg: message.GetHeadingDeg(), SpeedMPS: message.GetSpeedMps(), BatteryPercent: message.GetBatteryPercent(),
		RollDeg: attitude.GetX(), PitchDeg: attitude.GetY(), YawDeg: attitude.GetZ(), LinkQualityPercent: message.GetLinkQualityPercent(),
	}
	if telemetry.EventID == "" || telemetry.AssetID == "" || telemetry.ObservedUnixMillis <= 0 {
		return Telemetry{}, fmt.Errorf("required telemetry identity or timestamp is missing")
	}
	return telemetry, nil
}
