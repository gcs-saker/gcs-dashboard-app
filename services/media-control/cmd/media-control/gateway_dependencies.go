package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/authpolicy"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
)

const (
	gatewayTelemetryEventKeyPrefix = "gcs-saker:gateway:v1:telemetry-event:"
	gatewayTelemetryPendingTTL     = 30 * time.Second
	gatewayTelemetryStoredTTL      = 7 * 24 * time.Hour
)

type gatewayAuthAdapter struct {
	client            authpolicy.Client
	rpc               *authpolicy.DeviceRPCClient
	allowHTTPFallback bool
}

func (a gatewayAuthAdapter) AuthenticateGateway(ctx context.Context, credentials grpcgateway.GatewayCredentials) (grpcgateway.GatewayIdentity, error) {
	authorization, err := a.authenticateDevice(ctx, credentials)
	if err != nil {
		return grpcgateway.GatewayIdentity{}, err
	}
	return grpcgateway.GatewayIdentity{
		DeviceUUID: authorization.DeviceUUID, GroupID: authorization.GroupID,
		CredentialVersion: authorization.CredentialVersion, PolicyVersion: authorization.DevicePolicyVersion,
	}, nil
}

func (a gatewayAuthAdapter) authenticateDevice(ctx context.Context, credentials grpcgateway.GatewayCredentials) (authpolicy.DeviceAuthentication, error) {
	if a.rpc != nil {
		return a.rpc.AuthenticateDevice(ctx, credentials.DeviceUUID, credentials.Credential)
	}
	if !a.allowHTTPFallback {
		return authpolicy.DeviceAuthentication{}, fmt.Errorf("private device policy RPC unavailable")
	}
	return a.client.AuthenticateDevice(ctx, credentials.DeviceUUID, credentials.Credential)
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

type gatewayRuntime struct {
	server      grpcgateway.Server
	idempotency *redis.Client
	rpc         *authpolicy.DeviceRPCClient
}

func (r gatewayRuntime) Close() error {
	var rpcError error
	if r.rpc != nil {
		rpcError = r.rpc.Close()
	}
	return errors.Join(r.idempotency.Close(), rpcError)
}

func newGatewayRuntime(config runtimeConfig, metrics *httpapi.Metrics, sessions domain.PublishSessionStore) (gatewayRuntime, error) {
	client := authpolicy.NewClient(config.authPolicyBaseURL, &http.Client{Timeout: 3 * time.Second})
	var rpc *authpolicy.DeviceRPCClient
	if config.deviceRPCTarget != "" {
		var err error
		rpc, err = authpolicy.NewMTLSDeviceRPCClient(
			config.deviceRPCTarget, config.deviceRPCToken, config.authPolicyTLS(),
		)
		if err != nil {
			return gatewayRuntime{}, err
		}
	}
	if rpc == nil && !config.authPolicyHTTPFallback {
		return gatewayRuntime{}, fmt.Errorf("AUTH_POLICY_GRPC_TARGET is required")
	}
	authenticator := gatewayAuthAdapter{client: client, rpc: rpc, allowHTTPFallback: config.authPolicyHTTPFallback}
	redisConfig, err := redisOptions(config)
	if err != nil {
		return gatewayRuntime{}, errors.Join(err, closeDeviceRPC(rpc))
	}
	idempotency := redis.NewClient(redisConfig)
	server := grpcgateway.NewDeviceServer(authenticator, config.grpcMaxPayloadBytes, grpcgateway.NewTelemetryHandler(
		gatewayContextTelemetryStore{client: client, idempotency: idempotency, rpc: rpc},
	)).WithMetrics(metrics).WithSessionAuthenticator(grpcgateway.PublishSessionAuthenticator{
		Store: sessions, Validator: rpc, Secret: config.publishToken, Now: time.Now,
	})
	server, err = configureGatewayTransport(server)
	if err != nil {
		return gatewayRuntime{}, errors.Join(err, idempotency.Close(), closeDeviceRPC(rpc))
	}
	return gatewayRuntime{
		server:      server,
		idempotency: idempotency,
		rpc:         rpc,
	}, nil
}

func configureGatewayTransport(server grpcgateway.Server) (grpcgateway.Server, error) {
	if getenv("MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT", "false") == "true" {
		return server, nil
	}
	credentials, err := (grpcgateway.TLSFiles{
		CAFile: getenv("MEDIA_CONTROL_GRPC_CA_FILE", ""), CertFile: getenv("MEDIA_CONTROL_GRPC_CERT_FILE", ""),
		KeyFile: getenv("MEDIA_CONTROL_GRPC_KEY_FILE", ""), ServerName: "media-control",
	}).ServerCredentials()
	if err != nil {
		return grpcgateway.Server{}, err
	}
	return server.WithTransportCredentials(credentials), nil
}

func closeDeviceRPC(rpc *authpolicy.DeviceRPCClient) error {
	if rpc == nil {
		return nil
	}
	return rpc.Close()
}

type gatewayContextTelemetryStore struct {
	client      authpolicy.Client
	idempotency *redis.Client
	rpc         *authpolicy.DeviceRPCClient
}

func (s gatewayContextTelemetryStore) StoreTelemetry(ctx context.Context, identity grpcgateway.GatewayIdentity, telemetry grpcgateway.Telemetry) error {
	credentials, ok := grpcgateway.GatewayCredentialsFromContext(ctx)
	if !ok {
		return fmt.Errorf("gateway credentials missing")
	}
	key := gatewayTelemetryEventKeyPrefix + identity.DeviceUUID + ":" + telemetry.EventID
	acquired, err := s.idempotency.SetNX(ctx, key, "pending", gatewayTelemetryPendingTTL).Result()
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
	if err := s.persistTelemetry(ctx, identity, credentials, telemetry); err != nil {
		if deleteErr := s.idempotency.Del(ctx, key).Err(); deleteErr != nil {
			return errors.Join(err, fmt.Errorf("release telemetry reservation: %w", deleteErr))
		}
		return err
	}
	if err := s.idempotency.Set(ctx, key, "stored", gatewayTelemetryStoredTTL).Err(); err != nil {
		return fmt.Errorf("commit telemetry event idempotency: %w", err)
	}
	return nil
}

func (s gatewayContextTelemetryStore) persistTelemetry(ctx context.Context, identity grpcgateway.GatewayIdentity, credentials grpcgateway.GatewayCredentials, telemetry grpcgateway.Telemetry) error {
	if s.rpc != nil {
		binding := domain.PublishSession{DeviceUUID: identity.DeviceUUID, GroupID: identity.GroupID,
			CredentialVersion: identity.CredentialVersion, DevicePolicyVersion: identity.PolicyVersion}
		if identity.Session != nil {
			binding = *identity.Session
		}
		return s.rpc.IngestBoundTelemetry(ctx, binding, telemetry.Envelope)
	}
	return (gatewayTelemetryStore{client: s.client, credentials: credentials}).StoreTelemetry(ctx, identity, telemetry)
}
