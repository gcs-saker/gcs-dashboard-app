package httpapi

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func testStreamSessions(lister StreamLister, groups domain.StreamGroupResolver) *domain.InMemoryPublishSessionStore {
	store := domain.NewInMemoryPublishSessionStore()
	streams, _ := lister.ListStreams(context.Background())
	paths := []string{"raw/local/webcam", "raw/company-b/front", "raw/drone-01/front", "raw/mobile/front"}
	for _, stream := range streams {
		paths = append(paths, string(stream.Path))
	}
	for _, path := range paths {
		parsed, err := domain.ParseStreamPath(path)
		if err != nil {
			continue
		}
		_ = store.Save(context.Background(), domain.PublishSession{
			SessionID: "test-" + parsed.StreamID, DeviceUUID: parsed.AssetID, StreamID: parsed.StreamID,
			Path: parsed.Path, GroupID: groups.TargetFor(parsed).PublisherGroupID,
			Status: domain.PublishSessionActive, RenewalTokenExpiresAt: time.Now().Add(time.Hour),
		})
	}
	return store
}

func TestStreamScopeUsesSessionAndNeverDefaultGroup(t *testing.T) {
	ctx := context.Background()
	server := newTestServer(fakeStreams{}, fakeIce{})
	parsed, _ := domain.ParseStreamPath("raw/device/opaque")
	if _, err := server.resolveStreamTarget(ctx, parsed); !errors.Is(err, domain.ErrStreamAccessDenied) {
		t.Fatalf("unmapped stream must fail closed: %v", err)
	}
	session := domain.PublishSession{SessionID: "new-session", DeviceUUID: "drone", StreamID: parsed.StreamID,
		Path: parsed.Path, GroupID: "co-b", Status: domain.PublishSessionActive, RenewalTokenExpiresAt: time.Now().Add(time.Minute)}
	if err := server.publishSessions.Save(ctx, session); err != nil {
		t.Fatal(err)
	}
	target, err := server.resolveStreamTarget(ctx, parsed)
	if err != nil || target.PublisherGroupID != "co-b" {
		t.Fatalf("session scope not used: %+v %v", target, err)
	}
	if err := server.publishSessions.End(ctx, session.SessionID, time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := server.resolveStreamTarget(ctx, parsed); !errors.Is(err, domain.ErrStreamAccessDenied) {
		t.Fatalf("ended stream must not fall back to default group: %v", err)
	}
}
