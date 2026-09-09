package grpcgateway

import (
	"context"
	"testing"

	"google.golang.org/grpc/metadata"
)

func FuzzGatewayMetadata(f *testing.F) {
	f.Add("device", "credential", "", "")
	f.Add("", "", "session", "Bearer token")
	f.Fuzz(func(t *testing.T, uuid, credential, session, authorization string) {
		ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
			metadataDeviceUUID, uuid,
			metadataDeviceCredential, credential,
			metadataPublishSession, session,
			metadataAuthorization, authorization,
		))
		result, err := gatewayCredentials(ctx)
		if err == nil && result.SessionID == "" && (result.DeviceUUID == "" || result.Credential == "") {
			t.Fatal("accepted incomplete gateway identity")
		}
	})
}
