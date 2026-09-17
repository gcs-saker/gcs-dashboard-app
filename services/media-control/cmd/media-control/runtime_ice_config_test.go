package main

import "testing"

func TestLoadIceServersKeepsStaticTurnCredentialsInCompatibilityMode(t *testing.T) {
	t.Setenv(string(runtimeEnv.turnCredentialMode), turnCredentialModeStatic)
	t.Setenv(string(runtimeEnv.turnUsername), "legacy-user")
	t.Setenv(string(runtimeEnv.turnStaticPassword), "legacy-password")
	t.Setenv(string(runtimeEnv.turnPrimaryURL), "turn:legacy.example:3478")
	t.Setenv(string(runtimeEnv.turnSecondaryURL), "")

	servers := loadIceServers()
	if len(servers) != 2 {
		t.Fatalf("expected STUN and TURN servers, got %d", len(servers))
	}
	turnServer := servers[1]
	if turnServer.Username != "legacy-user" || turnServer.Credential != "legacy-password" {
		t.Fatalf("unexpected static TURN credentials: %#v", turnServer)
	}
}

func TestLoadIceServersDefersCredentialsInSharedSecretMode(t *testing.T) {
	t.Setenv(string(runtimeEnv.turnCredentialMode), turnCredentialModeSharedSecret)
	t.Setenv(string(runtimeEnv.turnPrimaryURL), "turn:shared.example:3478")
	t.Setenv(string(runtimeEnv.turnSecondaryURL), "")

	servers := loadIceServers()
	if len(servers) != 2 {
		t.Fatalf("expected STUN and TURN servers, got %d", len(servers))
	}
	if servers[1].Credential != "issued-per-request" {
		t.Fatalf("expected deferred TURN credential, got %q", servers[1].Credential)
	}
}
