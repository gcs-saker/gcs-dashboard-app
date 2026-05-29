package domain

import "fmt"

type IceServerKind string

const (
	IceServerSTUN IceServerKind = "stun"
	IceServerTURN IceServerKind = "turn"
)

type IceServer struct {
	URL        string        `json:"url"`
	Kind       IceServerKind `json:"kind"`
	Username   string        `json:"username,omitempty"`
	Credential string        `json:"credential,omitempty"`
	Healthy    bool          `json:"healthy"`
}

func NewIceServer(url string, kind IceServerKind, username string, credential string, healthy bool) (IceServer, error) {
	if url == "" {
		return IceServer{}, fmt.Errorf("ice server url must not be blank")
	}
	if kind != IceServerSTUN && kind != IceServerTURN {
		return IceServer{}, fmt.Errorf("unsupported ice server kind: %s", kind)
	}
	if kind == IceServerTURN && (username == "" || credential == "") {
		return IceServer{}, fmt.Errorf("turn server requires username and credential")
	}
	return IceServer{URL: url, Kind: kind, Username: username, Credential: credential, Healthy: healthy}, nil
}

func HealthyIceServers(servers []IceServer) []IceServer {
	healthy := make([]IceServer, 0, len(servers))
	for _, server := range servers {
		if server.Healthy {
			healthy = append(healthy, server)
		}
	}
	return healthy
}
