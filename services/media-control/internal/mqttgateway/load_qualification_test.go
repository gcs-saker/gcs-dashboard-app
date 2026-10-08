package mqttgateway

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const (
	loadMessagesPerDevice = 10
	loadMessagesPerSecond = 10
	loadScenarioTimeout   = 5 * time.Second
	maxP95Latency         = 200 * time.Millisecond
	maxP99Latency         = 400 * time.Millisecond
)

func TestTelemetryIngressLoadQualification(t *testing.T) {
	report := loadQualificationReport{
		SchemaVersion: "gcs-saker.telemetry-load.v1", GeneratedAt: time.Now().UTC(),
		SourceRevision: os.Getenv("TELEMETRY_LOAD_SOURCE_REVISION"), Runtime: runtime.Version(),
		Platform: runtime.GOOS + "/" + runtime.GOARCH,
		Scope:    "in-process MQTT ingress partition pipeline; excludes broker, network, gRPC and database latency",
		Thresholds: loadThresholds{MaxP95Millis: float64(maxP95Latency.Milliseconds()),
			MaxP99Millis: float64(maxP99Latency.Milliseconds()), MinimumThroughputRatio: 0.5},
	}
	if report.SourceRevision == "" {
		report.SourceRevision = "working-tree"
	}
	for _, devices := range []int{10, 50, 100} {
		result := runLoadScenario(t, devices)
		assertLoadThresholds(t, result)
		report.Results = append(report.Results, result)
	}
	if output := os.Getenv("TELEMETRY_LOAD_EVIDENCE_PATH"); output != "" {
		writeLoadEvidence(t, output, report)
	}
}

func runLoadScenario(t *testing.T, devices int) loadScenarioResult {
	t.Helper()
	messageCount := devices * loadMessagesPerDevice
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ingress := make(chan mqtt.Message, ingressQueueCapacity)
	metrics := newLoadMetrics()
	collector := newLoadCollector(messageCount)
	handler := func(_ context.Context, _ mqtt.Client, message mqtt.Message, _ Exchange) error {
		collector.record(message.(*loadMessage))
		message.Ack()
		return nil
	}
	done := make(chan error, 1)
	go func() {
		done <- (consumer{queue: ingress, lost: make(chan struct{}), metrics: metrics, handle: handler}).run(ctx)
	}()
	started := time.Now()
	publishLoadMessages(ctx, ingress, metrics, devices)
	collector.await(t, loadScenarioTimeout)
	elapsed := time.Since(started)
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return collector.result(devices, elapsed, metrics)
}

func publishLoadMessages(ctx context.Context, ingress chan<- mqtt.Message, metrics *loadMetrics, devices int) {
	interval := time.Second / time.Duration(devices*loadMessagesPerSecond)
	for sequence := 1; sequence <= loadMessagesPerDevice; sequence++ {
		for device := 0; device < devices; device++ {
			message := newLoadMessage(device, sequence)
			enqueueMessage(ctx, ingress, message, metrics)
			time.Sleep(interval)
		}
	}
}

func assertLoadThresholds(t *testing.T, result loadScenarioResult) {
	t.Helper()
	if result.Failed != 0 || result.Backpressure != 0 || result.Lost != 0 || result.OrderErrors != 0 {
		t.Fatalf("load integrity threshold failed: %+v", result)
	}
	if result.P95Millis > float64(maxP95Latency.Milliseconds()) || result.P99Millis > float64(maxP99Latency.Milliseconds()) {
		t.Fatalf("load latency threshold failed: %+v", result)
	}
	minimumThroughput := float64(result.Devices*loadMessagesPerSecond) * 0.5
	if result.ThroughputPerSecond < minimumThroughput {
		t.Fatalf("load throughput threshold failed: %+v", result)
	}
}

type loadMessage struct {
	topic     string
	sequence  int
	createdAt time.Time
	acked     atomic.Bool
}

func newLoadMessage(device, sequence int) *loadMessage {
	sessionID := fmt.Sprintf("ps_load_%03d", device)
	deviceUUID := fmt.Sprintf("device-%03d", device)
	return &loadMessage{topic: "gcs/device/" + deviceUUID + "/" + sessionID + "/telemetry", sequence: sequence, createdAt: time.Now()}
}

func (m *loadMessage) Duplicate() bool   { return false }
func (m *loadMessage) Qos() byte         { return 1 }
func (m *loadMessage) Retained() bool    { return false }
func (m *loadMessage) Topic() string     { return m.topic }
func (m *loadMessage) MessageID() uint16 { return uint16(m.sequence) }
func (m *loadMessage) Payload() []byte   { return []byte(strconv.Itoa(m.sequence)) }
func (m *loadMessage) Ack()              { m.acked.Store(true) }

type loadCollector struct {
	mu          sync.Mutex
	expected    int
	processed   int
	orderErrors int
	sequences   map[string]int
	latencies   []time.Duration
	complete    chan struct{}
	once        sync.Once
}

func newLoadCollector(expected int) *loadCollector {
	return &loadCollector{expected: expected, sequences: make(map[string]int), complete: make(chan struct{})}
}

func (c *loadCollector) record(message *loadMessage) {
	c.mu.Lock()
	defer c.mu.Unlock()
	sessionID, _ := SessionFromTopic(message.topic)
	if message.sequence != c.sequences[sessionID]+1 {
		c.orderErrors++
	}
	c.sequences[sessionID] = message.sequence
	c.latencies = append(c.latencies, time.Since(message.createdAt))
	c.processed++
	if c.processed == c.expected {
		c.once.Do(func() { close(c.complete) })
	}
}

func (c *loadCollector) await(t *testing.T, timeout time.Duration) {
	t.Helper()
	select {
	case <-c.complete:
	case <-time.After(timeout):
		t.Fatalf("load scenario timed out: processed=%d expected=%d", c.processedCount(), c.expected)
	}
}

func (c *loadCollector) processedCount() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.processed
}

func (c *loadCollector) result(devices int, elapsed time.Duration, metrics *loadMetrics) loadScenarioResult {
	c.mu.Lock()
	defer c.mu.Unlock()
	sort.Slice(c.latencies, func(left, right int) bool { return c.latencies[left] < c.latencies[right] })
	backpressure, failed := metrics.count("backpressure"), metrics.count("failed")
	return loadScenarioResult{
		Devices: devices, Sent: c.expected, Processed: c.processed, Failed: failed, Backpressure: backpressure,
		Lost: c.expected - c.processed - backpressure, OrderErrors: c.orderErrors, MaxQueueDepth: metrics.maximum(),
		P50Millis: percentileMillis(c.latencies, 0.50), P95Millis: percentileMillis(c.latencies, 0.95),
		P99Millis: percentileMillis(c.latencies, 0.99), ThroughputPerSecond: float64(c.processed) / elapsed.Seconds(),
	}
}

type loadMetrics struct {
	mu         sync.Mutex
	results    map[string]int
	queueDepth int
	maxDepth   int
}

func newLoadMetrics() *loadMetrics { return &loadMetrics{results: make(map[string]int)} }

func (m *loadMetrics) ObserveMQTTIngress(result string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.results[result]++
}

func (m *loadMetrics) AdjustMQTTQueueDepth(delta int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.queueDepth += delta
	if m.queueDepth > m.maxDepth {
		m.maxDepth = m.queueDepth
	}
}

func (m *loadMetrics) SetMQTTQueueDepth(depth int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.queueDepth = depth
}

func (m *loadMetrics) count(result string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.results[result]
}

func (m *loadMetrics) maximum() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.maxDepth
}

type loadQualificationReport struct {
	SchemaVersion  string               `json:"schemaVersion"`
	GeneratedAt    time.Time            `json:"generatedAt"`
	SourceRevision string               `json:"sourceRevision"`
	Runtime        string               `json:"runtime"`
	Platform       string               `json:"platform"`
	Scope          string               `json:"scope"`
	Thresholds     loadThresholds       `json:"thresholds"`
	Results        []loadScenarioResult `json:"results"`
}

type loadThresholds struct {
	MaxP95Millis           float64 `json:"maxP95Millis"`
	MaxP99Millis           float64 `json:"maxP99Millis"`
	MinimumThroughputRatio float64 `json:"minimumThroughputRatio"`
}

type loadScenarioResult struct {
	Devices             int     `json:"devices"`
	Sent                int     `json:"sent"`
	Processed           int     `json:"processed"`
	Failed              int     `json:"failed"`
	Backpressure        int     `json:"backpressure"`
	Lost                int     `json:"lost"`
	OrderErrors         int     `json:"orderErrors"`
	MaxQueueDepth       int     `json:"maxQueueDepth"`
	P50Millis           float64 `json:"p50Millis"`
	P95Millis           float64 `json:"p95Millis"`
	P99Millis           float64 `json:"p99Millis"`
	ThroughputPerSecond float64 `json:"throughputPerSecond"`
}

func percentileMillis(values []time.Duration, percentile float64) float64 {
	index := int(float64(len(values)-1) * percentile)
	return float64(values[index].Microseconds()) / 1000
}

func writeLoadEvidence(t *testing.T, path string, report loadQualificationReport) {
	t.Helper()
	wire, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(wire, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}
