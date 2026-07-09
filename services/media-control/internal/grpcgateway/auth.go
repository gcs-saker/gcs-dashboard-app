package grpcgateway

import (
	"context"
	"strings"

	"google.golang.org/grpc/metadata"
)

const (
	metadataAuthorization = "authorization"
	metadataGatewayToken  = "x-gcs-gateway-token"
	metadataReconnect     = "x-gcs-gateway-reconnect"
	bearerPrefix          = "bearer "
)

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
