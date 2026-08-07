package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
)

type gatewayAuthAdapter struct{ client authpolicy.Client }

func (a gatewayAuthAdapter) AuthenticateGateway(ctx context.Context, credentials grpcgateway.GatewayCredentials) (grpcgateway.GatewayIdentity, error) {
	authorization, err := a.client.AuthenticateDevice(ctx, credentials.DeviceUUID, credentials.Credential)
	if err != nil {
		return grpcgateway.GatewayIdentity{}, err
	}
	return grpcgateway.GatewayIdentity{
		DeviceUUID: authorization.DeviceUUID, GroupID: authorization.GroupID,
		CredentialVersion: authorization.CredentialVersion, PolicyVersion: authorization.DevicePolicyVersion,
	}, nil
}

type gatewayTelemetryStore struct {
	client      authpolicy.Client
	credentials grpcgateway.GatewayCredentials
}

func (s gatewayTelemetryStore) StoreTelemetry(ctx context.Context, identity grpcgateway.GatewayIdentity, telemetry grpcgateway.Telemetry) error {
	if identity.DeviceUUID != s.credentials.DeviceUUID {
		return fmt.Errorf("authenticated device changed")
	}
	return s.client.IngestDeviceTelemetry(ctx, s.credentials.DeviceUUID, s.credentials.Credential, authpolicy.DeviceTelemetry{
		EventID: telemetry.EventID, UUID: telemetry.AssetID, Latitude: telemetry.Latitude, Longitude: telemetry.Longitude,
		Altitude: telemetry.AltitudeM, Velocity: telemetry.SpeedMPS, BatteryPercent: telemetry.BatteryPercent,
		HeadingDeg: telemetry.HeadingDeg, RollDeg: telemetry.RollDeg, PitchDeg: telemetry.PitchDeg,
		YawDeg: telemetry.YawDeg, LinkQualityPercent: telemetry.LinkQualityPercent,
		ObservedUnixMillis: telemetry.ObservedUnixMillis,
	})
}

func newGatewayServer(config runtimeConfig) grpcgateway.Server {
	client := authpolicy.NewClient(config.authPolicyBaseURL, &http.Client{Timeout: 3 * time.Second})
	authenticator := gatewayAuthAdapter{client: client}
	idempotency := redis.NewClient(&redis.Options{
		Addr: config.redisAddress, Password: config.redisPassword, DialTimeout: config.redisTimeout,
	})
	return grpcgateway.NewDeviceServer(authenticator, config.grpcMaxPayloadBytes, grpcgateway.NewTelemetryHandler(
		gatewayContextTelemetryStore{client: client, idempotency: idempotency},
	))
}

type gatewayContextTelemetryStore struct {
	client      authpolicy.Client
	idempotency *redis.Client
}

func (s gatewayContextTelemetryStore) StoreTelemetry(ctx context.Context, identity grpcgateway.GatewayIdentity, telemetry grpcgateway.Telemetry) error {
	credentials, ok := grpcgateway.GatewayCredentialsFromContext(ctx)
	if !ok {
		return fmt.Errorf("gateway credentials missing")
	}
	key := "gcs-saker:gateway:telemetry-event:" + identity.DeviceUUID + ":" + telemetry.EventID
	acquired, err := s.idempotency.SetNX(ctx, key, "pending", 30*time.Second).Result()
	if err != nil {
		return fmt.Errorf("reserve telemetry event: %w", err)
	}
	if !acquired {
		state, stateErr := s.idempotency.Get(ctx, key).Result()
		if stateErr == nil && state == "stored" {
			return nil
		}
		return fmt.Errorf("telemetry event is already being stored")
	}
	if err := (gatewayTelemetryStore{client: s.client, credentials: credentials}).StoreTelemetry(ctx, identity, telemetry); err != nil {
		_ = s.idempotency.Del(ctx, key).Err()
		return err
	}
	if err := s.idempotency.Set(ctx, key, "stored", 7*24*time.Hour).Err(); err != nil {
		return fmt.Errorf("commit telemetry event idempotency: %w", err)
	}
	return nil
}
