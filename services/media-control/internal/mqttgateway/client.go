package mqttgateway

import (
	"context"
	"fmt"
	"io"
	"time"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

func GRPCExchange(connection grpc.ClientConnInterface) Exchange {
	client := pb.NewSakerGatewayServiceClient(connection)
	return func(ctx context.Context, sessionID, token string, request *pb.GatewayStreamRequest) (*pb.GatewayStreamResponse, error) {
		ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		defer cancel()
		ctx = metadata.AppendToOutgoingContext(ctx, "x-gcs-publish-session-id", sessionID, "authorization", "Bearer "+token)
		stream, err := client.Exchange(ctx)
		if err != nil {
			return nil, err
		}
		// gRPC may report EOF from Send before the final authentication status is read.
		if err := stream.Send(request); err != nil && err != io.EOF {
			return nil, err
		}
		response, err := stream.Recv()
		if err != nil {
			return nil, err
		}
		if response.RequestId != request.RequestId {
			return nil, fmt.Errorf("gateway_response_mismatch")
		}
		return response, nil
	}
}
