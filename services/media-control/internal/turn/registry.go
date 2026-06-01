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
	servers []domain.IceServer
	probe   ServerProbe
}

func NewRegistry(servers []domain.IceServer, probe ServerProbe) Registry {
	if probe == nil {
		probe = StaticProbe{}
	}
	return Registry{servers: servers, probe: probe}
}

func (r Registry) HealthyIceServers() []domain.IceServer {
	healthy := make([]domain.IceServer, 0, len(r.servers))
	for _, server := range r.servers {
		if r.probe.Healthy(server) {
			server.Healthy = true
			healthy = append(healthy, server)
		}
	}
	return healthy
}
