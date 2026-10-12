package main

import (
	"crypto/subtle"
	"errors"
	"strings"
)

const minimumServiceCredentialLength = 32

var errInvalidRuntimeCredentials = errors.New("runtime service credentials must be independent and at least 32 characters")

func validateRuntimeCredentialSeparation(config runtimeConfig) error {
	publishToken := strings.TrimSpace(config.publishToken)
	grpcToken := strings.TrimSpace(config.grpcToken)
	if len(publishToken) < minimumServiceCredentialLength || len(grpcToken) < minimumServiceCredentialLength {
		return errInvalidRuntimeCredentials
	}
	if subtle.ConstantTimeCompare([]byte(publishToken), []byte(grpcToken)) == 1 {
		return errInvalidRuntimeCredentials
	}
	return nil
}
