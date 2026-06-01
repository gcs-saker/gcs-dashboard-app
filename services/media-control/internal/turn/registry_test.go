package turn

import (
	"testing"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

type mapProbe map[string]bool

func (m mapProbe) Healthy(server domain.IceServer) bool {
	return m[server.URL]
}

func TestHealthyIceServersUsesProbe(t *testing.T) {
	primary, _ := domain.NewIceServer("turn:primary", domain.IceServerTURN, "user", "pass", false)
	secondary, _ := domain.NewIceServer("turn:secondary", domain.IceServerTURN, "user", "pass", false)

	registry := NewRegistry([]domain.IceServer{primary, secondary}, mapProbe{"turn:secondary": true})
	healthy := registry.HealthyIceServers()

	if len(healthy) != 1 {
		t.Fatalf("expected one healthy server, got %d", len(healthy))
	}
	if healthy[0].URL != "turn:secondary" {
		t.Fatalf("expected secondary, got %s", healthy[0].URL)
	}
	if !healthy[0].Healthy {
		t.Fatal("expected registry to mark probed server healthy")
	}
}
