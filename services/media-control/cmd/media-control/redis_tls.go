package main

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	"github.com/redis/go-redis/v9"
)

func redisOptions(config runtimeConfig) (*redis.Options, error) {
	options := &redis.Options{Addr: config.redisAddress, Password: config.redisPassword,
		DialTimeout: config.redisTimeout, ReadTimeout: config.redisTimeout, WriteTimeout: config.redisTimeout}
	if config.redisAllowPlaintext {
		return options, nil
	}
	if config.redisCAFile == "" || config.redisServerName == "" {
		return nil, fmt.Errorf("Redis TLS CA and server name are required")
	}
	caPEM, err := os.ReadFile(config.redisCAFile)
	if err != nil {
		return nil, fmt.Errorf("read Redis CA: %w", err)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("parse Redis CA")
	}
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS13, RootCAs: roots, ServerName: config.redisServerName}
	if config.redisCertFile != "" || config.redisKeyFile != "" {
		certificate, certErr := tls.LoadX509KeyPair(config.redisCertFile, config.redisKeyFile)
		if certErr != nil {
			return nil, fmt.Errorf("load Redis client identity: %w", certErr)
		}
		tlsConfig.Certificates = []tls.Certificate{certificate}
	}
	options.TLSConfig = tlsConfig
	return options, nil
}
