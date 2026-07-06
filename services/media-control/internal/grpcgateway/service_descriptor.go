package grpcgateway

import "google.golang.org/grpc"

const (
	serviceName        = "gcs.saker.v1.SakerGatewayService"
	methodExchange     = "Exchange"
	fullMethodExchange = "/gcs.saker.v1.SakerGatewayService/Exchange"
	protoMetadata      = "gcs/saker/v1/gateway_service.proto"
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
