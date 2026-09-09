package authpolicy

import (
	"strings"
	"testing"
)

func TestPrivateRPCRejectsPlaintextTransport(t *testing.T) {
	client, err := NewDeviceRPCClient("auth-policy:9091", strings.Repeat("t", 32), nil)
	if err == nil || client != nil {
		t.Fatal("private RPC must reject a missing mTLS transport")
	}
}

func TestPrivateRPCRejectsIncompleteTLSIdentity(t *testing.T) {
	_, err := NewMTLSDeviceRPCClient(
		"auth-policy:9091",
		strings.Repeat("t", 32),
		RPCClientTLSConfig{ServerName: "auth-policy"},
	)
	if err == nil {
		t.Fatal("private RPC must reject incomplete certificate paths")
	}
}
