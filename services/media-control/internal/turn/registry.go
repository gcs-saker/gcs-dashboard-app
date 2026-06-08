package turn

import "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"

type ServerProbe interface {
	Healthy(server domain.IceServer) bool
}

type StaticProbe struct{}

func (StaticProbe) Healthy(server domain.IceServer) bool {
	return server.Healthy
}

type Registry struct {
	servers        []domain.IceServer
	probe          ServerProbe
	maxTurnServers int
}

func NewRegistry(servers []domain.IceServer, probe ServerProbe) Registry {
	return NewRegistryWithTurnLimit(servers, probe, 1)
}

func NewRegistryWithTurnLimit(servers []domain.IceServer, probe ServerProbe, maxTurnServers int) Registry {
	if probe == nil {
		probe = StaticProbe{}
	}
	if maxTurnServers < 0 {
		maxTurnServers = 0
	}
	return Registry{servers: servers, probe: probe, maxTurnServers: maxTurnServers}
}

func (r Registry) HealthyIceServers() []domain.IceServer {
	healthy := make([]domain.IceServer, 0, len(r.servers))
	turnServers := 0
	for _, server := range r.servers {
		if r.probe.Healthy(server) {
			server.Healthy = true
			if server.Kind == domain.IceServerTURN {
				if turnServers >= r.maxTurnServers {
					continue
				}
				turnServers++
			}
			healthy = append(healthy, server)
		}
	}
	return healthy
}
