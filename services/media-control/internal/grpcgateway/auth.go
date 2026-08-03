package grpcgateway

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/grpc/metadata"
)

const (
	metadataAuthorization    = "authorization"
	metadataGatewayToken     = "x-gcs-gateway-token"
	metadataDeviceUUID       = "x-gcs-device-uuid"
	metadataDeviceCredential = "x-gcs-device-credential"
	metadataReconnect        = "x-gcs-gateway-reconnect"
	bearerPrefix             = "bearer "
)

type GatewayCredentials struct {
	DeviceUUID string
	Credential string
}

type GatewayIdentity struct {
	DeviceUUID        string
	GroupID           string
	CredentialVersion int64
	PolicyVersion     int64
}

type GatewayAuthenticator interface {
	AuthenticateGateway(context.Context, GatewayCredentials) (GatewayIdentity, error)
}

type gatewayIdentityContextKey struct{}
type gatewayCredentialsContextKey struct{}

func GatewayIdentityFromContext(ctx context.Context) (GatewayIdentity, bool) {
	identity, ok := ctx.Value(gatewayIdentityContextKey{}).(GatewayIdentity)
	return identity, ok
}

func GatewayCredentialsFromContext(ctx context.Context) (GatewayCredentials, bool) {
	credentials, ok := ctx.Value(gatewayCredentialsContextKey{}).(GatewayCredentials)
	return credentials, ok
}

func gatewayCredentials(ctx context.Context) (GatewayCredentials, error) {
	uuidValues := metadataValues(ctx, metadataDeviceUUID)
	credentialValues := metadataValues(ctx, metadataDeviceCredential)
	if len(uuidValues) != 1 || len(credentialValues) != 1 {
		return GatewayCredentials{}, fmt.Errorf("exactly one UUID and credential are required")
	}
	credentials := GatewayCredentials{
		DeviceUUID: strings.TrimSpace(uuidValues[0]),
		Credential: strings.TrimSpace(credentialValues[0]),
	}
	if credentials.DeviceUUID == "" || credentials.Credential == "" {
		return GatewayCredentials{}, fmt.Errorf("UUID and credential must not be blank")
	}
	return credentials, nil
}

func (s Server) authorized(ctx context.Context) bool {
	if s.token == "" {
		return false
	}
	if metadataContains(ctx, metadataGatewayToken, s.token) {
		return true
	}
	for _, value := range metadataValues(ctx, metadataAuthorization) {
		if strings.EqualFold(strings.TrimSpace(value), bearerPrefix+s.token) {
			return true
		}
	}
	return false
}

func metadataContains(ctx context.Context, key string, expected string) bool {
	for _, value := range metadataValues(ctx, key) {
		if strings.TrimSpace(value) == expected {
			return true
		}
	}
	return false
}

func metadataValues(ctx context.Context, key string) []string {
	incoming, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return nil
	}
	return incoming.Get(key)
}
