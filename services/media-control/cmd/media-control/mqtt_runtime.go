package main

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/mqttgateway"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func startMQTTAdapter(parent context.Context, config runtimeConfig) (func(), error) {
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
			KeyFile: getenv("MQTT_GATEWAY_KEY_FILE", ""), ServerName: getenv("MQTT_GATEWAY_SERVER_NAME", "")}}
	if err := settings.Validate(); err != nil {
		return nil, err
	}
	_, port, err := net.SplitHostPort(config.grpcListenAddress)
	if err != nil {
		return nil, fmt.Errorf("gateway listen address invalid")
	}
	connection, err := grpc.NewClient(net.JoinHostPort("127.0.0.1", port), grpc.WithTransportCredentials(insecure.NewCredentials()))
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
