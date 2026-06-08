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

type IceServerList struct {
	values []IceServer
}

func NewIceServerList(servers []IceServer) IceServerList {
	values := append([]IceServer(nil), servers...)
	return IceServerList{values: values}
}

func (l IceServerList) Values() []IceServer {
	return append([]IceServer(nil), l.values...)
}

func (l IceServerList) Healthy() IceServerList {
	healthy := make([]IceServer, 0, len(l.values))
	for _, server := range l.values {
		if server.Healthy {
			healthy = append(healthy, server)
		}
	}
	return NewIceServerList(healthy)
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
	return NewIceServerList(servers).Healthy().Values()
}
