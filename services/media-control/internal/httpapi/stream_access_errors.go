package httpapi

import (
	"errors"
	"net/http"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const (
	metricErrorAuthenticationRequired = "authentication_required"
	metricErrorAccessDenied           = "access_denied"
)

func (s Server) writeStreamAccessError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrStreamAuthenticationRequired):
		s.metrics.ObserveError(metricSourceHTTP, metricErrorAuthenticationRequired)
		writeJSON(w, http.StatusUnauthorized, errorPayload(errAuthenticationRequiredMessage))
	case errors.Is(err, domain.ErrStreamAccessDenied):
		s.metrics.ObserveError(metricSourceHTTP, metricErrorAccessDenied)
		writeJSON(w, http.StatusForbidden, errorPayload(errStreamAccessDeniedMessage))
	default:
		s.metrics.ObserveError(metricSourceHTTP, metricResultError)
		writeJSON(w, http.StatusBadGateway, errorPayload(errAuthorizationUnavailable))
	}
}
