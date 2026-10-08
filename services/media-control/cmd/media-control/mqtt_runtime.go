package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/grpcgateway"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/httpapi"
	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mqttgateway"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
)

func startMQTTAdapter(parent context.Context, config runtimeConfig, metrics *httpapi.Metrics) (func(), error) {
	broker := getenv("MQTT_GATEWAY_URL", "")
	if broker == "" {
		return func() {}, nil
	}
	if config.deviceRPCTarget == "" {
		return nil, fmt.Errorf("MQTT requires private device policy RPC")
	}
	settings := mqttgateway.Config{URL: broker, Username: getenv("MQTT_GATEWAY_USERNAME", ""),
		Password: getenv("MQTT_GATEWAY_PASSWORD", ""), AllowPlaintext: getenv("MQTT_GATEWAY_ALLOW_PLAINTEXT", "false") == "true",
		TLS: mqttgateway.TLSFiles{CAFile: getenv("MQTT_GATEWAY_CA_FILE", ""), CertFile: getenv("MQTT_GATEWAY_CERT_FILE", ""),
			KeyFile: getenv("MQTT_GATEWAY_KEY_FILE", ""), ServerName: getenv("MQTT_GATEWAY_SERVER_NAME", "")}, Metrics: metrics}
	if err := settings.Validate(); err != nil {
		return nil, err
	}
	connection, err := newLoopbackGatewayConnection(config.grpcListenAddress)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(parent)
	done := make(chan struct{})
	go func() {
		defer close(done)
		if err := mqttgateway.Run(ctx, settings, mqttgateway.GRPCExchange(connection)); err != nil {
			slog.Error("mqtt_adapter_stopped", "error_code", "adapter_failed")
		}
	}()
	return func() {
		cancel()
		select {
		case <-done:
		case <-time.After(12 * time.Second):
			slog.Error("mqtt_shutdown", "error_code", "shutdown_timeout")
		}
		if err := connection.Close(); err != nil {
			slog.Error("mqtt_shutdown", "error_code", "grpc_close_failed")
		}
	}, nil
}

func newLoopbackGatewayConnection(listenAddress string) (*grpc.ClientConn, error) {
	_, port, err := net.SplitHostPort(listenAddress)
	if err != nil {
		return nil, fmt.Errorf("gateway listen address invalid")
	}
	transport, err := loopbackGatewayCredentials()
	if err != nil {
		return nil, err
	}
	return grpc.NewClient(net.JoinHostPort("127.0.0.1", port), grpc.WithTransportCredentials(transport))
}

func loopbackGatewayCredentials() (credentials.TransportCredentials, error) {
	if getenv("MEDIA_CONTROL_GRPC_ALLOW_PLAINTEXT", "false") == "true" {
		return insecure.NewCredentials(), nil
	}
	return (grpcgateway.TLSFiles{
		CAFile: getenv("MEDIA_CONTROL_GRPC_CA_FILE", ""), CertFile: getenv("MEDIA_CONTROL_GRPC_CERT_FILE", ""),
		KeyFile: getenv("MEDIA_CONTROL_GRPC_KEY_FILE", ""), ServerName: "media-control",
	}).ClientCredentials()
}
