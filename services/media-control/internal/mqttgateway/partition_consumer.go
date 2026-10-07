package mqttgateway

import (
	"context"
	"errors"
	"log/slog"
	"sync"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	defaultPartitionWorkers = 4
	partitionQueueCapacity  = 16
)

type messageHandler func(context.Context, mqtt.Client, mqtt.Message, Exchange) error

type consumer struct {
	client            mqtt.Client
	queue             <-chan mqtt.Message
	lost              <-chan struct{}
	exchange          Exchange
	metrics           IngressMetrics
	workerCount       int
	partitionCapacity int
	handle            messageHandler
}

func (c consumer) run(ctx context.Context) error {
	workerContext, cancelWorkers := context.WithCancel(ctx)
	partitions, workerErrors, workers := c.startWorkers(workerContext)
	defer func() {
		cancelWorkers()
		workers.Wait()
		if c.metrics != nil {
			c.metrics.SetMQTTQueueDepth(0)
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-c.lost:
			return errors.New("mqtt_connection_lost")
		case err := <-workerErrors:
			return err
		case message := <-c.queue:
			if err := c.dispatch(ctx, message, partitions, workerErrors); err != nil {
				return err
			}
		}
	}
}

func (c consumer) startWorkers(ctx context.Context) ([]chan mqtt.Message, <-chan error, *sync.WaitGroup) {
	count, capacity := c.partitionSettings()
	partitions := make([]chan mqtt.Message, count)
	errors := make(chan error, count)
	workers := &sync.WaitGroup{}
	for index := range partitions {
		partitions[index] = make(chan mqtt.Message, capacity)
	}
	for index := range partitions {
		workers.Add(1)
		go c.runPartition(ctx, partitions[index], errors, workers)
	}
	return partitions, errors, workers
}

func (c consumer) runPartition(
	ctx context.Context,
	messages <-chan mqtt.Message,
	failures chan<- error,
	workers *sync.WaitGroup,
) {
	defer workers.Done()
	handler := c.handle
	if handler == nil {
		handler = deliver
	}
	for {
		select {
		case <-ctx.Done():
			return
		case message := <-messages:
			if err := handler(ctx, c.client, message, c.exchange); err != nil {
				c.adjustQueueDepth(-1)
				observeIngress(c.metrics, "failed")
				slog.Warn("mqtt_ingress", "result", "failed", "error_code", "result_delivery_failed")
				select {
				case failures <- err:
				default:
				}
				return
			}
			c.adjustQueueDepth(-1)
			observeIngress(c.metrics, "processed")
		}
	}
}

func (c consumer) dispatch(ctx context.Context, message mqtt.Message, partitions []chan mqtt.Message, failures <-chan error) error {
	sessionID, err := SessionFromTopic(message.Topic())
	if err != nil {
		message.Ack()
		c.adjustQueueDepth(-1)
		observeIngress(c.metrics, "rejected")
		return nil
	}
	partition := partitions[partitionIndex(sessionID, len(partitions))]
	select {
	case partition <- message:
		return nil
	case <-ctx.Done():
		return nil
	case <-c.lost:
		return errors.New("mqtt_connection_lost")
	case err := <-failures:
		return err
	}
}

func (c consumer) partitionSettings() (int, int) {
	count, capacity := c.workerCount, c.partitionCapacity
	if count <= 0 {
		count = defaultPartitionWorkers
	}
	if capacity <= 0 {
		capacity = partitionQueueCapacity
	}
	return count, capacity
}

func (c consumer) adjustQueueDepth(delta int) {
	if c.metrics == nil {
		return
	}
	c.metrics.AdjustMQTTQueueDepth(delta)
}

func partitionIndex(sessionID string, count int) int {
	hash := uint32(2166136261)
	for index := 0; index < len(sessionID); index++ {
		hash ^= uint32(sessionID[index])
		hash *= 16777619
	}
	return int(hash % uint32(count))
}
