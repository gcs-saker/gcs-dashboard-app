package turn

import "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"

type ServerProbe interface {
	Healthy(server domain.IceServer) bool
}

type StaticProbe struct{}

func (StaticProbe) Healthy(server domain.IceServer) bool {
	return server.Healthy
}

type RegistryPolicy struct {
	maxTurnServers int
}

func NewRegistryPolicy(maxTurnServers int) RegistryPolicy {
	if maxTurnServers < 0 {
		maxTurnServers = 0
	}
	return RegistryPolicy{maxTurnServers: maxTurnServers}
}

func (p RegistryPolicy) AllowsTurnRelay(selectedTurnServers int) bool {
	return selectedTurnServers < p.maxTurnServers
}

type Registry struct {
	servers []domain.IceServer
	probe   ServerProbe
	policy  RegistryPolicy
}

func NewRegistry(servers []domain.IceServer, probe ServerProbe) Registry {
	return NewRegistryWithTurnLimit(servers, probe, 1)
}

func NewRegistryWithTurnLimit(servers []domain.IceServer, probe ServerProbe, maxTurnServers int) Registry {
	if probe == nil {
		probe = StaticProbe{}
	}
	return Registry{servers: servers, probe: probe, policy: NewRegistryPolicy(maxTurnServers)}
}

func (r Registry) HealthyIceServers() []domain.IceServer {
	healthy := make([]domain.IceServer, 0, len(r.servers))
	turnServers := 0
	for _, server := range r.servers {
		if r.probe.Healthy(server) {
			server.Healthy = true
			if server.Kind == domain.IceServerTURN {
				if !r.policy.AllowsTurnRelay(turnServers) {
					continue
				}
				turnServers++
			}
			healthy = append(healthy, server)
		}
	}
	return healthy
}
