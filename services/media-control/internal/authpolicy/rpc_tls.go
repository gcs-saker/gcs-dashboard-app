package authpolicy

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	"google.golang.org/grpc/credentials"
)

type RPCClientTLSConfig struct {
	CAFile     string
	CertFile   string
	KeyFile    string
	ServerName string
}

func (c RPCClientTLSConfig) transportCredentials() (credentials.TransportCredentials, error) {
	if c.CAFile == "" || c.CertFile == "" || c.KeyFile == "" || c.ServerName == "" {
		return nil, fmt.Errorf("private RPC mTLS configuration incomplete")
	}
	certificate, err := tls.LoadX509KeyPair(c.CertFile, c.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("load private RPC client identity: %w", err)
	}
	caPEM, err := os.ReadFile(c.CAFile)
	if err != nil {
		return nil, fmt.Errorf("load private RPC trust anchor: %w", err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("private RPC trust anchor is invalid")
	}
	config := &tls.Config{
		MinVersion: tls.VersionTLS13,
		RootCAs:    roots, Certificates: []tls.Certificate{certificate}, ServerName: c.ServerName,
	}
	return credentials.NewTLS(config), nil
}
