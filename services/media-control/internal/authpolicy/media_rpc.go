package authpolicy

import (
	"context"
	"strings"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (c *DeviceRPCClient) AuthorizeStream(ctx context.Context, authorization string, target domain.StreamAccessTarget) (domain.StreamAccessDecision, error) {
	if strings.TrimSpace(authorization) == "" {
		return domain.StreamAccessDecision{}, domain.ErrStreamAuthenticationRequired
	}
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := pb.NewMediaPolicyServiceClient(c.connection).AuthorizeStream(ctx, &pb.StreamAccessInput{
		Authorization: authorization, StreamId: target.StreamID, Path: target.Path, PublisherGroupId: target.PublisherGroupID, Action: target.Action,
	})
	if status.Code(err) == codes.Unauthenticated {
		return domain.StreamAccessDecision{}, domain.ErrStreamAuthenticationRequired
	}
	if status.Code(err) == codes.PermissionDenied {
		return domain.StreamAccessDecision{}, domain.ErrStreamAccessDenied
	}
	if err != nil {
		return domain.StreamAccessDecision{}, err
	}
	expires := time.UnixMilli(result.ExpiresUnixMillis)
	decision := domain.StreamAccessDecision{StreamID: result.StreamId, Allowed: result.Allowed,
		PrincipalID: result.PrincipalId, GroupID: result.GroupId, ExpiresAt: &expires, Reason: "policy_evaluated"}
	if !result.Allowed {
		return decision, domain.ErrStreamAccessDenied
	}
	return decision, nil
}

func (c *DeviceRPCClient) AuthorizeDevicePublish(ctx context.Context, command domain.DevicePublishCommand) (domain.DevicePublishAuthorization, error) {
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := pb.NewMediaPolicyServiceClient(c.connection).AuthorizeDevicePublish(ctx, &pb.DevicePublishInput{
		DeviceUuid: command.DeviceUUID, Credential: command.Credential, SensorId: command.SensorID,
	})
	return mapPublishBinding(result, err)
}

func (c *DeviceRPCClient) AuthorizeAccountPublish(ctx context.Context, command domain.AccountPublishCommand) (domain.DevicePublishAuthorization, error) {
	ctx, cancel := c.requestContext(ctx)
	defer cancel()
	result, err := pb.NewMediaPolicyServiceClient(c.connection).AuthorizeAccountPublish(ctx, &pb.AccountPublishInput{
		Authorization: command.Authorization, SensorId: command.SensorID,
	})
	return mapPublishBinding(result, err)
}

func mapPublishBinding(binding *pb.PublishBindingOutput, err error) (domain.DevicePublishAuthorization, error) {
	switch status.Code(err) {
	case codes.Unauthenticated, codes.PermissionDenied:
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishAccessDenied
	case codes.InvalidArgument:
		return domain.DevicePublishAuthorization{}, domain.ErrDevicePublishPolicyInvalid
	}
	if err != nil {
		return domain.DevicePublishAuthorization{}, err
	}
	return domain.DevicePublishAuthorization{DeviceUUID: binding.DeviceUuid, PublisherGroupID: binding.GroupId,
		SensorID: binding.SensorId, StreamID: binding.StreamId, Path: binding.Path, CredentialVersion: binding.CredentialVersion,
		DevicePolicyVersion: binding.PolicyVersion}, nil
}
