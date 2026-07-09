package main

import (
	"log"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

func loadIceServers() []domain.IceServer {
	turnUsername := getenv(runtimeEnv.turnUsername, runtimeDefaults.turnUsername)
	turnPassword := getenv(runtimeEnv.turnPassword, runtimeDefaults.turnPassword)
	return mustIceServers([]iceServerConfig{
		{URL: getenv(runtimeEnv.stunURL, runtimeDefaults.stunURL), Kind: domain.IceServerSTUN, Healthy: true},
		{URL: getenv(runtimeEnv.turnPrimaryURL, runtimeDefaults.turnPrimaryURL), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
		{URL: getenv(runtimeEnv.turnSecondaryURL, runtimeDefaults.turnSecondaryURL), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
	})
}

type iceServerConfig struct {
	URL        string
	Kind       domain.IceServerKind
	Username   string
	Credential string
	Healthy    bool
}

func mustIceServers(configs []iceServerConfig) []domain.IceServer {
	servers := make([]domain.IceServer, 0, len(configs))
	for _, config := range configs {
		server, err := domain.NewIceServer(config.URL, config.Kind, config.Username, config.Credential, config.Healthy)
		if err != nil {
			log.Fatal(err)
		}
		servers = append(servers, server)
	}
	return servers
}
