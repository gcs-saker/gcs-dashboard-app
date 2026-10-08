package mqttgateway

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func TestConsumerPreservesSessionOrderWhileOtherPartitionsProgress(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	alpha, beta := sessionsInDifferentPartitions(t, 2)
	queue := make(chan mqtt.Message, 3)
	queue <- newTestMessage(alpha, "1")
	queue <- newTestMessage(alpha, "2")
	queue <- newTestMessage(beta, "1")
	firstStarted, releaseFirst := make(chan struct{}), make(chan struct{})
	secondProcessed, betaProcessed := make(chan struct{}), make(chan struct{})
	handler := func(ctx context.Context, _ mqtt.Client, message mqtt.Message, _ Exchange) error {
		switch string(message.Payload()) {
		case "1":
			if sessionFromTopicOrFail(t, message.Topic()) == alpha {
				close(firstStarted)
				select {
				case <-releaseFirst:
				case <-ctx.Done():
				}
			} else {
				close(betaProcessed)
			}
		case "2":
			close(secondProcessed)
		}
		return nil
	}
	done := make(chan error, 1)
	go func() {
		done <- (consumer{queue: queue, lost: make(chan struct{}), workerCount: 2, partitionCapacity: 2, handle: handler}).run(ctx)
	}()
	waitSignal(t, firstStarted)
	waitSignal(t, betaProcessed)
	select {
	case <-secondProcessed:
		t.Fatal("same-session message overtook the blocked predecessor")
	default:
	}
	close(releaseFirst)
	waitSignal(t, secondProcessed)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}

func TestConsumerCancellationStopsSaturatedPartition(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	queue := make(chan mqtt.Message, 3)
	for index := 0; index < 3; index++ {
		queue <- newTestMessage("ps_saturated", "blocked")
	}
	started := make(chan struct{})
	var once sync.Once
	handler := func(ctx context.Context, _ mqtt.Client, _ mqtt.Message, _ Exchange) error {
		once.Do(func() { close(started) })
		<-ctx.Done()
		return nil
	}
	done := make(chan error, 1)
	go func() {
		done <- (consumer{queue: queue, lost: make(chan struct{}), workerCount: 1, partitionCapacity: 1, handle: handler}).run(ctx)
	}()
	waitSignal(t, started)
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("consumer did not stop after cancellation")
	}
}

func TestEnqueueBackpressureLeavesQoSMessageUnacknowledged(t *testing.T) {
	queue := make(chan mqtt.Message, 1)
	queue <- newTestMessage("ps_full", "first")
	message := newTestMessage("ps_full", "retry")
	metrics := &recordingIngressMetrics{}

	if enqueueMessage(context.Background(), queue, message, metrics) {
		t.Fatal("full ingress queue accepted another message")
	}
	if message.acked.Load() {
		t.Fatal("backpressured QoS message was acknowledged instead of retained for redelivery")
	}
	if metrics.resultCount("backpressure") != 1 {
		t.Fatalf("missing backpressure metric: %#v", metrics.results)
	}
}

func sessionsInDifferentPartitions(t *testing.T, count int) (string, string) {
	t.Helper()
	first := "ps_partition_0"
	for index := 1; index < 100; index++ {
		candidate := "ps_partition_" + string(rune('a'+index))
		if partitionIndex(first, count) != partitionIndex(candidate, count) {
			return first, candidate
		}
	}
	t.Fatal("could not find sessions in different partitions")
	return "", ""
}

func sessionFromTopicOrFail(t *testing.T, topic string) string {
	t.Helper()
	sessionID, err := SessionFromTopic(topic)
	if err != nil {
		t.Fatal(err)
	}
	return sessionID
}

func waitSignal(t *testing.T, signal <-chan struct{}) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for worker")
	}
}

type testMessage struct {
	topic   string
	payload []byte
	acked   atomic.Bool
}

func newTestMessage(sessionID string, payload string) *testMessage {
	return &testMessage{topic: "gcs/device/device-01/" + sessionID + "/telemetry", payload: []byte(payload)}
}

func (m *testMessage) Duplicate() bool   { return false }
func (m *testMessage) Qos() byte         { return 1 }
func (m *testMessage) Retained() bool    { return false }
func (m *testMessage) Topic() string     { return m.topic }
func (m *testMessage) MessageID() uint16 { return 1 }
func (m *testMessage) Payload() []byte   { return m.payload }
func (m *testMessage) Ack()              { m.acked.Store(true) }

type recordingIngressMetrics struct {
	mu      sync.Mutex
	results []string
	depth   int
}

func (m *recordingIngressMetrics) ObserveMQTTIngress(result string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.results = append(m.results, result)
}

func (m *recordingIngressMetrics) SetMQTTQueueDepth(depth int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.depth = depth
}

func (m *recordingIngressMetrics) AdjustMQTTQueueDepth(delta int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.depth += delta
}

func (m *recordingIngressMetrics) resultCount(target string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	count := 0
	for _, result := range m.results {
		if result == target {
			count++
		}
	}
	return count
}
