package grpcgateway

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"os"

	"google.golang.org/grpc/credentials"
)

type TLSFiles struct {
	CAFile, CertFile, KeyFile, ServerName string
}

func (f TLSFiles) Complete() bool {
	return f.CAFile != "" && f.CertFile != "" && f.KeyFile != "" && f.ServerName != ""
}

func (f TLSFiles) ServerCredentials() (credentials.TransportCredentials, error) {
	certificate, roots, err := f.identityAndRoots()
	if err != nil {
		return nil, err
	}
	return credentials.NewTLS(&tls.Config{
		MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{certificate},
		ClientAuth: tls.RequireAndVerifyClientCert, ClientCAs: roots,
	}), nil
}

func (f TLSFiles) ClientCredentials() (credentials.TransportCredentials, error) {
	certificate, roots, err := f.identityAndRoots()
	if err != nil {
		return nil, err
	}
	return credentials.NewTLS(&tls.Config{
		MinVersion: tls.VersionTLS13, Certificates: []tls.Certificate{certificate},
		RootCAs: roots, ServerName: f.ServerName,
	}), nil
}

func (f TLSFiles) identityAndRoots() (tls.Certificate, *x509.CertPool, error) {
	if !f.Complete() {
		return tls.Certificate{}, nil, errors.New("grpc_mtls_files_required")
	}
	certificate, err := tls.LoadX509KeyPair(f.CertFile, f.KeyFile)
	if err != nil {
		return tls.Certificate{}, nil, errors.New("grpc_client_identity_invalid")
	}
	caPEM, err := os.ReadFile(f.CAFile)
	if err != nil {
		return tls.Certificate{}, nil, errors.New("grpc_trust_anchor_invalid")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return tls.Certificate{}, nil, errors.New("grpc_trust_anchor_invalid")
	}
	return certificate, roots, nil
}
