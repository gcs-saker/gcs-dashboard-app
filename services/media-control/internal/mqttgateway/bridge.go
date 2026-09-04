package mqttgateway

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
	"google.golang.org/protobuf/proto"
)

const operationTimeout = 5 * time.Second
const queueCapacity = 64

type Config struct {
	URL            string
	Username       string
	Password       string
	AllowPlaintext bool
	Ready          func()
}

func (c Config) Validate() error {
	u, err := url.Parse(c.URL)
	if err != nil || u.Host == "" || u.User != nil || c.Username == "" || c.Password == "" {
		return errors.New("mqtt_config_invalid")
	}
	if u.Scheme != "ssl" && !(c.AllowPlaintext && u.Scheme == "tcp") {
		return errors.New("mqtt_tls_required")
	}
	return nil
}

// Run owns the connection and its bounded queue. Failure stops this opt-in adapter,
// never the existing HTTP/gRPC ingress; the caller records the failed state.
func Run(ctx context.Context, config Config, exchange Exchange) error {
	if err := config.Validate(); err != nil {
		return err
	}
	queue := make(chan mqtt.Message, queueCapacity)
	lost := make(chan struct{}, 1)
	options := mqtt.NewClientOptions().AddBroker(config.URL).SetClientID("gcs-mqtt-lab-ingress").
		SetUsername(config.Username).SetPassword(config.Password).SetCleanSession(true).
		SetAutoReconnect(false).SetConnectRetry(false).SetAutoAckDisabled(true).
		SetConnectTimeout(operationTimeout).SetWriteTimeout(operationTimeout).SetPingTimeout(operationTimeout).
		SetTLSConfig(&tls.Config{MinVersion: tls.VersionTLS12})
	options.SetConnectionLostHandler(func(mqtt.Client, error) {
		select {
		case lost <- struct{}{}:
		default:
		}
	})
	client := mqtt.NewClient(options)
	defer client.Disconnect(250)
	if err := await(client.Connect()); err != nil {
		return fmt.Errorf("mqtt_connect_failed")
	}
	callback := func(_ mqtt.Client, message mqtt.Message) {
		select {
		case queue <- message:
		case <-ctx.Done():
		default:
			slog.Warn("mqtt_ingress", "result", "backpressure", "error_code", "queue_full")
			message.Ack()
		}
	}
	if err := await(client.Subscribe(Subscription, 1, callback)); err != nil {
		return fmt.Errorf("mqtt_subscribe_failed")
	}
	if config.Ready != nil {
		config.Ready()
	}
	return (consumer{client: client, queue: queue, lost: lost, exchange: exchange}).run(ctx)
}

type consumer struct {
	client   mqtt.Client
	queue    <-chan mqtt.Message
	lost     <-chan struct{}
	exchange Exchange
}

func (c consumer) run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-c.lost:
			return errors.New("mqtt_connection_lost")
		case message := <-c.queue:
			if err := deliver(ctx, c.client, message, c.exchange); err != nil {
				slog.Warn("mqtt_ingress", "result", "failed", "error_code", "result_delivery_failed")
				return err
			}
		}
	}
}

func deliver(ctx context.Context, client mqtt.Client, message mqtt.Message, exchange Exchange) error {
	sessionID, err := SessionFromTopic(message.Topic())
	if err != nil {
		message.Ack()
		return nil
	}
	response := &pb.GatewayStreamResponse{Status: pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED, ReasonCode: "mqtt_message_rejected"}
	if !message.Retained() {
		result, handleErr := Handle(ctx, exchange, message.Topic(), message.Payload())
		if handleErr == nil {
			response = result
		}
	}
	wire, err := proto.Marshal(response)
	if err != nil {
		return errors.New("mqtt_result_encode_failed")
	}
	if err := await(client.Publish("gcs/device/"+sessionID+"/result", 1, false, wire)); err != nil {
		return errors.New("mqtt_result_publish_failed")
	}
	message.Ack()
	slog.Info("mqtt_ingress", "operation", "telemetry", "result", response.Status.String())
	return nil
}

func await(token mqtt.Token) error {
	if !token.WaitTimeout(operationTimeout) {
		return errors.New("mqtt_operation_timeout")
	}
	return token.Error()
}
