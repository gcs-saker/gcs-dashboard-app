package httpapi

import (
	"context"
	"net/http"
	"runtime"
	"runtime/debug"
	"time"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func (s Server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, serviceStatusResponse{
		Status:  healthStatusOK,
		Service: mediaControlServiceName,
	})
}

func (s Server) readyz(w http.ResponseWriter, r *http.Request) {
	checks := []readinessCheck{
		s.streamRegistryReadiness(r.Context()),
		s.iceServerReadiness(),
	}
	if check, ok := s.grpcGatewayReadiness(); ok {
		checks = append(checks, check)
	}

	status, httpStatus := readinessStatus(checks)
	writeJSON(w, httpStatus, readinessResponse{
		Service: mediaControlServiceName,
		Status:  status,
		Checks:  checks,
	})
}

func (s Server) runtimeMetrics(w http.ResponseWriter, _ *http.Request) {
	var stats runtime.MemStats
	runtime.ReadMemStats(&stats)
	writeJSON(w, http.StatusOK, runtimeResponse{
		Service: mediaControlServiceName,
		Runtime: runtimeMetricsResponse{
			Goroutines:       runtime.NumGoroutine(),
			HeapAllocBytes:   stats.HeapAlloc,
			HeapInUseBytes:   stats.HeapInuse,
			NextGCBytes:      stats.NextGC,
			PauseTotalNs:     stats.PauseTotalNs,
			LastGCUnixNano:   stats.LastGC,
			MemoryLimitBytes: debug.SetMemoryLimit(-1),
		},
	})
}

func readinessStatus(checks []readinessCheck) (string, int) {
	for _, check := range checks {
		if check.Status == healthStatusError && check.Required {
			return healthStatusDegraded, http.StatusServiceUnavailable
		}
	}
	return healthStatusOK, http.StatusOK
}

func (s Server) streamRegistryReadiness(ctx context.Context) readinessCheck {
	if _, err := s.listStreams(ctx); err != nil {
		return readinessCheck{
			Name:     readyCheckStreamRegistry,
			Status:   healthStatusError,
			Required: true,
			Reason:   errStreamRegistryQueryFailed,
		}
	}
	return readinessCheck{Name: readyCheckStreamRegistry, Status: healthStatusOK, Required: true}
}

func (s Server) iceServerReadiness() readinessCheck {
	if len(s.healthyIceServers()) == 0 {
		return readinessCheck{
			Name:     readyCheckIceServers,
			Status:   healthStatusError,
			Required: true,
			Reason:   errNoHealthyIceServers,
		}
	}
	return readinessCheck{Name: readyCheckIceServers, Status: healthStatusOK, Required: true}
}

func (s Server) grpcGatewayReadiness() (readinessCheck, bool) {
	if s.gateway == nil {
		return readinessCheck{}, false
	}
	ready, reason := s.gateway.Ready()
	if !ready {
		if reason == "" {
			reason = errGrpcGatewayUnavailable
		}
		return readinessCheck{
			Name:     readyCheckGrpcGateway,
			Status:   healthStatusError,
			Required: true,
			Reason:   reason,
		}, true
	}
	return readinessCheck{Name: readyCheckGrpcGateway, Status: healthStatusOK, Required: true}, true
}

func (s Server) listStreams(ctx context.Context) ([]domain.StreamDescriptor, error) {
	started := time.Now()
	streams, err := s.streams.ListStreams(ctx)
	s.metrics.ObserveStreamRegistry(err, time.Since(started))
	return streams, err
}

func (s Server) healthyIceServers() []domain.IceServer {
	servers := s.ice.HealthyIceServers()
	s.metrics.ObserveIceServers(len(servers))
	return servers
}
