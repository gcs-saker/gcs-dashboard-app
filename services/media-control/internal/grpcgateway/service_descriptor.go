package grpcgateway

import (
	sakerv1 "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc"
)

var (
	serviceName        = sakerv1.SakerGatewayService_ServiceDesc.ServiceName
	methodExchange     = sakerv1.SakerGatewayService_ServiceDesc.Streams[0].StreamName
	fullMethodExchange = sakerv1.SakerGatewayService_Exchange_FullMethodName
	protoMetadata      = sakerv1.SakerGatewayService_ServiceDesc.Metadata
)

func (s Server) Register(server *grpc.Server) {
	server.RegisterService(&grpc.ServiceDesc{
		ServiceName: serviceName,
		HandlerType: (*gatewayExchangeServer)(nil),
		Streams: []grpc.StreamDesc{
			{
				StreamName:    methodExchange,
				Handler:       s.exchangeHandler,
				ServerStreams: true,
				ClientStreams: true,
			},
		},
		Metadata: protoMetadata,
	}, &gatewayExchangeService{})
}

type gatewayExchangeServer interface{}

type gatewayExchangeService struct{}
