package controlapp

import (
	"context"
	"testing"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/controlroute"
	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

func TestControlApplicationCreatesLeaseAndPublishesOrderedCommand(t *testing.T) {
	commands := &commandPublisherStub{}
	app := testControlApplication(policyStub(true), leaseStub(true), commands)
	session, err := app.CreateSession(context.Background(), "Bearer token", SessionRequest{"device-01", "session-01"})
	if err != nil || session.ControlSessionID != "cs_test" {
		t.Fatalf("unexpected session: %+v err=%v", session, err)
	}
	response, err := app.SubmitCommand(context.Background(), "Bearer token", session.ControlSessionID,
		CommandRequest{Command: "STOP", Sequence: 1, IdempotencyID: "idem-1"})
	if err != nil || response.Status != "accepted" || commands.command.Sequence != 1 {
		t.Fatalf("unexpected command: %+v err=%v", response, err)
	}
	if _, err := app.SubmitCommand(context.Background(), "Bearer token", session.ControlSessionID,
		CommandRequest{Command: "STOP", Sequence: 1, IdempotencyID: "idem-2"}); err != ErrDenied {
		t.Fatalf("duplicate sequence must fail: %v", err)
	}
}

func TestControlApplicationFailsClosedForPolicyAndLeaseConflict(t *testing.T) {
	if _, err := testControlApplication(policyStub(false), leaseStub(true), &commandPublisherStub{}).
		CreateSession(context.Background(), "Bearer token", SessionRequest{"device-01", "session-01"}); err != ErrDenied {
		t.Fatalf("expected denial: %v", err)
	}
	if _, err := testControlApplication(policyStub(true), leaseStub(false), &commandPublisherStub{}).
		CreateSession(context.Background(), "Bearer token", SessionRequest{"device-01", "session-01"}); err != ErrConflict {
		t.Fatalf("expected conflict: %v", err)
	}
}

func TestControlApplicationPrunesExpiredSessionState(t *testing.T) {
	app := testControlApplication(policyStub(true), leaseStub(true), &commandPublisherStub{})
	ids := []string{"cs_one", "cs_two"}
	app.newID = func(string) (string, error) { id := ids[0]; ids = ids[1:]; return id, nil }
	first, err := app.CreateSession(context.Background(), "Bearer token", SessionRequest{"device-01", "session-01"})
	if err != nil {
		t.Fatal(err)
	}
	app.mu.Lock()
	state := app.sessions[first.ControlSessionID]
	state.expiresAt = app.now().Add(-time.Second)
	app.sessions[first.ControlSessionID] = state
	app.mu.Unlock()
	if _, err := app.CreateSession(context.Background(), "Bearer token", SessionRequest{"device-01", "session-01"}); err != nil {
		t.Fatal(err)
	}
	app.mu.Lock()
	_, remains := app.sessions[first.ControlSessionID]
	app.mu.Unlock()
	if remains {
		t.Fatal("expired control session was not cleaned up")
	}
}

func testControlApplication(policy ControlPolicyClient, lease ControlLeaseStore, commands ControlCommandPublisher) *ControlApplication {
	app := NewControlApplication(policy, lease, routeResolverStub{}, commands)
	app.now = func() time.Time { return time.Unix(1_800_000_000, 0) }
	app.newID = func(prefix string) (string, error) { return prefix + "test", nil }
	return app
}

type policyStub bool

func (p policyStub) AuthorizeControl(context.Context, string, ControlPolicyTarget) (bool, error) {
	return bool(p), nil
}

type leaseStub bool

func (l leaseStub) Acquire(context.Context, string, string, time.Time, time.Time) (bool, error) {
	return bool(l), nil
}

type routeResolverStub struct{}

func (routeResolverStub) Resolve(context.Context, controlroute.RouteRequest) (controlroute.InternalRoute, error) {
	return controlroute.InternalRoute{}, nil
}

type commandPublisherStub struct{ command *pb.ControlCommandEnvelope }

func (p *commandPublisherStub) Publish(_ context.Context, _ controlroute.InternalRoute, command *pb.ControlCommandEnvelope, _ time.Time) error {
	p.command = command
	return nil
}
