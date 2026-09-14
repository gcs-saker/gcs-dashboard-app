package mediamtx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func TestListTalkbackSessionsUsesOpaqueReferenceAndServerGroup(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"items":[{"name":"talkback/raw/drone-01/front/operator01","ready":true},{"name":"raw/drone-01/front","ready":true}]}`))
	}))
	defer server.Close()
	groups, err := domain.NewStreamGroupResolver("co-a", "raw/drone-01/front=co-b")
	if err != nil {
		t.Fatal(err)
	}

	sessions, err := NewClient(server.URL, server.Client()).ListTalkbackSessions(context.Background(), groups)
	if err != nil || len(sessions) != 1 {
		t.Fatalf("expected one talkback session, got %#v %v", sessions, err)
	}
	if sessions[0].GroupID != "co-b" || sessions[0].Reference == "talkback/raw/drone-01/front/operator01" {
		t.Fatalf("expected server group and opaque reference, got %#v", sessions[0])
	}
}

func TestTalkbackLifecycleObserverPublishesOnlyTransitions(t *testing.T) {
	sink := &recordingLifecycleSink{}
	metrics := &recordingLifecycleMetrics{}
	observer := TalkbackLifecycleObserver{
		sink: sink, metrics: metrics, now: func() time.Time { return time.Unix(10, 0) },
	}
	first := TalkbackSession{Reference: "opaque-a", GroupID: "co-a"}
	second := TalkbackSession{Reference: "opaque-b", GroupID: "co-b"}

	observer.publishTransitions(context.Background(), map[string]TalkbackSession{"opaque-a": first}, map[string]TalkbackSession{"opaque-b": second})

	if len(sink.events) != 2 {
		t.Fatalf("expected start and disconnect, got %#v", sink.events)
	}
	if sink.events[0].Operation != "talkback.session.started" || sink.events[1].Operation != "talkback.session.disconnected" {
		t.Fatalf("unexpected lifecycle operations %#v", sink.events)
	}
	if len(metrics.transitions) != 2 || metrics.transitions[0] != "talkback.session.started" {
		t.Fatalf("expected low-cardinality lifecycle metrics, got %#v", metrics.transitions)
	}
}

func TestTalkbackLifecycleObserverMeasuresFailedSnapshot(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	metrics := &recordingLifecycleMetrics{}
	observer := NewTalkbackLifecycleObserver(
		NewClient(server.URL, server.Client()), domain.StreamGroupResolver{}, nil, time.Second,
	).WithMetrics(metrics)

	_, loaded := observer.snapshot(context.Background())

	if loaded || len(metrics.snapshotErrors) != 1 || metrics.snapshotErrors[0] == nil {
		t.Fatalf("expected failed snapshot metric, got loaded=%v metrics=%#v", loaded, metrics)
	}
}

type recordingLifecycleMetrics struct {
	snapshotErrors []error
	transitions    []string
}

func (m *recordingLifecycleMetrics) ObserveTalkbackSnapshot(err error, _ time.Duration) {
	m.snapshotErrors = append(m.snapshotErrors, err)
}

func (m *recordingLifecycleMetrics) ObserveTalkbackTransition(operation string, _ error) {
	m.transitions = append(m.transitions, operation)
}

type recordingLifecycleSink struct {
	events []TalkbackLifecycleEvent
}

func (s *recordingLifecycleSink) RecordTalkbackLifecycle(_ context.Context, event TalkbackLifecycleEvent) error {
	s.events = append(s.events, event)
	return nil
}
