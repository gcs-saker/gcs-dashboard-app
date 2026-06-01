package domain

import "testing"

func TestNewIceServerValidatesTurnCredentials(t *testing.T) {
	_, err := NewIceServer("turn:turn-primary:3478", IceServerTURN, "", "", true)
	if err == nil {
		t.Fatal("expected missing TURN credentials to fail")
	}
}

func TestHealthyIceServersFiltersUnhealthyServers(t *testing.T) {
	healthy, _ := NewIceServer("stun:turn-primary:3478", IceServerSTUN, "", "", true)
	unhealthy, _ := NewIceServer("stun:turn-secondary:3478", IceServerSTUN, "", "", false)

	result := HealthyIceServers([]IceServer{healthy, unhealthy})

	if len(result) != 1 {
		t.Fatalf("expected one healthy server, got %d", len(result))
	}
	if result[0].URL != healthy.URL {
		t.Fatalf("expected %s, got %s", healthy.URL, result[0].URL)
	}
}

func TestIceServerListDefensivelyCopiesAndFilters(t *testing.T) {
	healthy, _ := NewIceServer("stun:turn-primary:3478", IceServerSTUN, "", "", true)
	unhealthy, _ := NewIceServer("stun:turn-secondary:3478", IceServerSTUN, "", "", false)
	servers := []IceServer{healthy, unhealthy}

	list := NewIceServerList(servers)
	servers[0].Healthy = false
	values := list.Values()
	values[0].Healthy = false

	if len(list.Healthy().Values()) != 1 {
		t.Fatalf("expected one healthy server after external mutation attempts")
	}
}
