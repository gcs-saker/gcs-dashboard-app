package main

import (
	"fmt"
	"log"
	"strings"

	"github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/domain"
)

const (
	turnCredentialModeStatic       = "static"
	turnCredentialModeSharedSecret = "shared-secret"
)

func loadIceServers() []domain.IceServer {
	turnUsername := getenv(runtimeEnv.turnUsername, runtimeDefaults.turnUsername)
	turnPassword := configuredTurnCredential()
	return mustIceServers([]iceServerConfig{
		{URL: getenv(runtimeEnv.stunURL, runtimeDefaults.stunURL), Kind: domain.IceServerSTUN, Healthy: true},
		{URL: getenv(runtimeEnv.turnPrimaryURL, runtimeDefaults.turnPrimaryURL), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
		{URL: getenv(runtimeEnv.turnSecondaryURL, runtimeDefaults.turnSecondaryURL), Kind: domain.IceServerTURN, Username: turnUsername, Credential: turnPassword, Healthy: true},
	})
}

func loadTurnCredentialMode() string {
	mode := getenv(runtimeEnv.turnCredentialMode, runtimeDefaults.turnCredentialMode)
	if mode != turnCredentialModeStatic && mode != turnCredentialModeSharedSecret {
		log.Fatal(fmt.Errorf("unsupported TURN_CREDENTIAL_MODE: %s", mode))
	}
	return mode
}

func configuredTurnCredential() string {
	if loadTurnCredentialMode() == turnCredentialModeStatic {
		return getenv(runtimeEnv.turnStaticPassword, runtimeDefaults.turnStaticPassword)
	}
	return "issued-per-request"
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
		if strings.TrimSpace(config.URL) == "" {
			continue
		}
		server, err := domain.NewIceServer(config.URL, config.Kind, config.Username, config.Credential, config.Healthy)
		if err != nil {
			log.Fatal(err)
		}
		servers = append(servers, server)
	}
	return servers
}
