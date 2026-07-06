package httpapi

import "strings"

type dashboardStreamRoute struct {
	streamID string
	suffix   string
}

func dashboardStreamRouteFromPath(path string) (dashboardStreamRoute, bool) {
	trimmed := strings.TrimPrefix(path, routeDashboardStreamItemPrefix)
	if trimmed == path || trimmed == "" {
		return dashboardStreamRoute{}, false
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) > 2 {
		return dashboardStreamRoute{}, false
	}
	route := dashboardStreamRoute{streamID: parts[0]}
	if len(parts) == 2 {
		route.suffix = parts[1]
	}
	return route, true
}
