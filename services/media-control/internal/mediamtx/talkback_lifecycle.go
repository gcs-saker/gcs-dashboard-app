package mediamtx

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type TalkbackSession struct {
	Reference string
	GroupID   string
}

type TalkbackLifecycleEvent struct {
	Reference  string
	GroupID    string
	Operation  string
	OccurredAt time.Time
}

type TalkbackLifecycleSink interface {
	RecordTalkbackLifecycle(context.Context, TalkbackLifecycleEvent) error
}

type TalkbackLifecycleObserver struct {
	client   Client
	groups   domain.StreamGroupResolver
	sink     TalkbackLifecycleSink
	interval time.Duration
	timeout  time.Duration
	now      func() time.Time
}

func NewTalkbackLifecycleObserver(
	client Client,
	groups domain.StreamGroupResolver,
	sink TalkbackLifecycleSink,
	interval time.Duration,
) TalkbackLifecycleObserver {
	return TalkbackLifecycleObserver{
		client: client, groups: groups, sink: sink, interval: interval,
		timeout: 2 * time.Second, now: time.Now,
	}
}

func (o TalkbackLifecycleObserver) Run(ctx context.Context) {
	previous, ok := o.snapshot(ctx)
	if !ok {
		previous = map[string]TalkbackSession{}
	}
	ticker := time.NewTicker(o.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			current, loaded := o.snapshot(ctx)
			if loaded {
				o.publishTransitions(ctx, previous, current)
				previous = current
			}
		}
	}
}

func (o TalkbackLifecycleObserver) snapshot(ctx context.Context) (map[string]TalkbackSession, bool) {
	queryContext, cancel := context.WithTimeout(ctx, o.timeout)
	defer cancel()
	sessions, err := o.client.ListTalkbackSessions(queryContext, o.groups)
	if err != nil {
		return nil, false
	}
	result := make(map[string]TalkbackSession, len(sessions))
	for _, session := range sessions {
		result[session.Reference] = session
	}
	return result, true
}

func (o TalkbackLifecycleObserver) publishTransitions(
	ctx context.Context,
	previous map[string]TalkbackSession,
	current map[string]TalkbackSession,
) {
	for reference, session := range current {
		if _, existed := previous[reference]; !existed {
			o.publish(ctx, session, "talkback.session.started")
		}
	}
	for reference, session := range previous {
		if _, remains := current[reference]; !remains {
			o.publish(ctx, session, "talkback.session.disconnected")
		}
	}
}

func (o TalkbackLifecycleObserver) publish(ctx context.Context, session TalkbackSession, operation string) {
	if o.sink == nil {
		return
	}
	err := o.sink.RecordTalkbackLifecycle(ctx, TalkbackLifecycleEvent{
		Reference: session.Reference, GroupID: session.GroupID, Operation: operation, OccurredAt: o.now().UTC(),
	})
	if err != nil {
		log.Printf("talkback lifecycle audit failed error_code=audit_sink_failed error_type=%T", err)
	}
}

func (c Client) ListTalkbackSessions(
	ctx context.Context,
	groups domain.StreamGroupResolver,
) ([]TalkbackSession, error) {
	items, err := c.listPathItems(ctx)
	if err != nil {
		return nil, err
	}
	sessions := make([]TalkbackSession, 0)
	for _, item := range items {
		parsed, parseErr := domain.ParseStreamPath(item.Name)
		if parseErr != nil || parsed.Prefix != "talkback" || !item.Ready {
			continue
		}
		raw, rawErr := domain.ParseStreamPath(fmt.Sprintf("raw/%s/%s", parsed.AssetID, parsed.SensorID))
		if rawErr != nil {
			continue
		}
		sessions = append(sessions, TalkbackSession{Reference: hashReference(item.Name), GroupID: groups.TargetFor(raw).PublisherGroupID})
	}
	return sessions, nil
}

func hashReference(path string) string {
	digest := sha256.Sum256([]byte(path))
	return hex.EncodeToString(digest[:16])
}
