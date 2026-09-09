package authpolicy

import (
	"context"
	"fmt"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/metadata"
)

const deviceRPCTimeout = 3 * time.Second

type DeviceRPCClient struct {
	connection *grpc.ClientConn
	client     pb.DevicePolicyServiceClient
	token      string
}

// The plaintext hop is confined to the private container network in the opt-in lab.
func NewDeviceRPCClient(target, token string, transport credentials.TransportCredentials) (*DeviceRPCClient, error) {
	if target == "" || len(token) < 32 {
		return nil, fmt.Errorf("private device RPC configuration invalid")
	}
	if transport == nil {
		return nil, fmt.Errorf("private device RPC requires mTLS")
	}
	connection, err := grpc.NewClient(target, grpc.WithTransportCredentials(transport))
	if err != nil {
		return nil, err
	}
	return &DeviceRPCClient{connection: connection, client: pb.NewDevicePolicyServiceClient(connection), token: token}, nil
}

func NewMTLSDeviceRPCClient(target, token string, config RPCClientTLSConfig) (*DeviceRPCClient, error) {
	transport, err := config.transportCredentials()
	if err != nil {
		return nil, err
	}
	return NewDeviceRPCClient(target, token, transport)
}

func (c *DeviceRPCClient) Close() error { return c.connection.Close() }

func (c *DeviceRPCClient) requestContext(parent context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(metadata.AppendToOutgoingContext(parent, "x-gcs-internal-token", c.token), deviceRPCTimeout)
}

func (c *DeviceRPCClient) AuthenticateDevice(ctx context.Context, uuid, credential string) (DeviceAuthentication, error) {
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := c.client.AuthenticateDevice(ctx, &pb.DeviceCredentialRequest{DeviceUuid: uuid, Credential: credential})
	if err != nil {
		return DeviceAuthentication{}, err
	}
	return DeviceAuthentication{DeviceUUID: result.DeviceUuid, GroupID: result.GroupId,
		CredentialVersion: result.CredentialVersion, DevicePolicyVersion: result.PolicyVersion}, nil
}

func sessionBinding(session domain.PublishSession) *pb.DeviceBinding {
	return &pb.DeviceBinding{DeviceUuid: session.DeviceUUID, GroupId: session.GroupID,
		CredentialVersion: session.CredentialVersion, PolicyVersion: session.DevicePolicyVersion}
}

func (c *DeviceRPCClient) ValidateSessionBinding(ctx context.Context, session domain.PublishSession) error {
	if c == nil {
		return fmt.Errorf("private device RPC unavailable")
	}
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	_, err := c.client.ValidateBinding(ctx, sessionBinding(session))
	return err
}

func (c *DeviceRPCClient) IngestBoundTelemetry(ctx context.Context, session domain.PublishSession, sample *pb.TelemetryEnvelope) error {
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := c.client.IngestTelemetry(ctx, &pb.DeviceTelemetryRequest{
		Binding: sessionBinding(session), Telemetry: sample, SessionId: session.SessionID, StreamId: session.StreamID,
	})
	if err != nil {
		return err
	}
	if !result.Stored {
		return fmt.Errorf("telemetry storage not acknowledged")
	}
	return nil
}
