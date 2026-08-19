package httpapi

import (
	"net/http"
	"strings"
)

type publishSessionRoutes struct {
	collection string
	prefix     string
}

func (s Server) routePublishSessionRequest(
	w http.ResponseWriter,
	r *http.Request,
	routes publishSessionRoutes,
	create http.HandlerFunc,
) {
	if r.URL.Path == routes.collection {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		create(w, r)
		return
	}
	parts := publishSessionPathParts(r.URL.Path, routes.prefix)
	if len(parts) == 2 && parts[1] == "renew" && r.Method == http.MethodPost {
		s.renewDevicePublishSession(w, r, parts[0])
		return
	}
	if len(parts) == 1 && r.Method == http.MethodDelete {
		s.endDevicePublishSession(w, r, parts[0])
		return
	}
	http.NotFound(w, r)
}

func publishSessionPathParts(path string, prefix string) []string {
	trimmed := strings.TrimPrefix(path, prefix)
	return strings.Split(strings.Trim(trimmed, "/"), "/")
}
