package grpcgateway

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/proto"
)

func TestTLSFilesRejectMissingAndInvalidMaterial(t *testing.T) {
	if _, err := (TLSFiles{}).ServerCredentials(); err == nil {
		t.Fatal("missing server mTLS material was accepted")
	}
	directory := t.TempDir()
	caFile := filepath.Join(directory, "ca.crt")
	certFile := filepath.Join(directory, "client.crt")
	keyFile := filepath.Join(directory, "client.key")
	for _, path := range []string{caFile, certFile, keyFile} {
		if err := os.WriteFile(path, []byte("invalid"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	files := TLSFiles{CAFile: caFile, CertFile: certFile, KeyFile: keyFile, ServerName: "media-control"}
	if _, err := files.ClientCredentials(); err == nil {
		t.Fatal("invalid client mTLS material was accepted")
	}
}

func TestMTLSGatewayRoundTrip(t *testing.T) {
	directory := os.Getenv("TEST_GRPC_PKI_DIR")
	if directory == "" {
		t.Skip("TEST_GRPC_PKI_DIR is not configured")
	}
	serverFiles := TLSFiles{CAFile: filepath.Join(directory, "ca.crt"), CertFile: filepath.Join(directory, "media-control.crt"),
		KeyFile: filepath.Join(directory, "media-control.key"), ServerName: "media-control"}
	serverCredentials, err := serverFiles.ServerCredentials()
	if err != nil {
		t.Fatal(err)
	}
	address := reserveAddress(t)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go func() {
		_ = NewServer("gateway-secret", 65536).WithTransportCredentials(serverCredentials).Serve(ctx, address)
	}()

	clientFiles := TLSFiles{CAFile: filepath.Join(directory, "ca.crt"), CertFile: filepath.Join(directory, "backend.crt"),
		KeyFile: filepath.Join(directory, "backend.key"), ServerName: "media-control"}
	clientCredentials, err := clientFiles.ClientCredentials()
	if err != nil {
		t.Fatal(err)
	}
	connection, err := grpc.NewClient(address, grpc.WithTransportCredentials(clientCredentials))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = connection.Close() })
	request := &pb.GatewayStreamRequest{}
	if err := proto.Unmarshal(gatewayRequestOfKind("mtls-1", GatewayPayloadTelemetry), request); err != nil {
		t.Fatal(err)
	}
	callCtx, callCancel := context.WithTimeout(metadata.AppendToOutgoingContext(context.Background(),
		"authorization", "Bearer gateway-secret", "x-gcs-gateway-token", "gateway-secret"), 5*time.Second)
	defer callCancel()
	stream, err := pb.NewSakerGatewayServiceClient(connection).Exchange(callCtx)
	if err != nil {
		t.Fatal(err)
	}
	if err := stream.Send(request); err != nil {
		t.Fatal(err)
	}
	response, err := stream.Recv()
	if err != nil || response.GetRequestId() != "mtls-1" || response.GetReasonCode() == reasonUnauthorized {
		t.Fatalf("mTLS exchange response=%v err=%v", response, err)
	}
	plaintext, err := grpc.NewClient(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = plaintext.Close() })
	deniedCtx, deniedCancel := context.WithTimeout(context.Background(), time.Second)
	defer deniedCancel()
	denied, err := pb.NewSakerGatewayServiceClient(plaintext).Exchange(deniedCtx)
	if err == nil {
		err = denied.Send(request)
	}
	if err == nil {
		_, err = denied.Recv()
	}
	if err == nil {
		t.Fatal("plaintext gRPC client reached the mTLS gateway")
	}
}

func reserveAddress(t *testing.T) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	address := listener.Addr().String()
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return address
}
