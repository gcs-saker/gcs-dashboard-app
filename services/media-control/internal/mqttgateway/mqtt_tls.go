package mqttgateway

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"os"
)

type TLSFiles struct {
	CAFile     string
	CertFile   string
	KeyFile    string
	ServerName string
}

func (f TLSFiles) Complete() bool {
	return f.CAFile != "" && f.CertFile != "" && f.KeyFile != "" && f.ServerName != ""
}

func (f TLSFiles) Config() (*tls.Config, error) {
	if !f.Complete() {
		return nil, nil
	}
	certificate, err := tls.LoadX509KeyPair(f.CertFile, f.KeyFile)
	if err != nil {
		return nil, errors.New("mqtt_client_identity_invalid")
	}
	caPEM, err := os.ReadFile(f.CAFile)
	if err != nil {
		return nil, errors.New("mqtt_trust_anchor_invalid")
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, errors.New("mqtt_trust_anchor_invalid")
	}
	return &tls.Config{
		MinVersion: tls.VersionTLS13, RootCAs: roots,
		Certificates: []tls.Certificate{certificate}, ServerName: f.ServerName,
	}, nil
}
