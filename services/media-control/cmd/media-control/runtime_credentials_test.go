package main

import (
	"errors"
	"strings"
	"testing"
)

func TestRuntimeCredentialsMustBeStrongAndIndependent(t *testing.T) {
	valid := runtimeConfig{publishToken: strings.Repeat("p", 32), grpcToken: strings.Repeat("g", 32)}
	if err := validateRuntimeCredentialSeparation(valid); err != nil {
		t.Fatal(err)
	}

	invalid := []runtimeConfig{
		{publishToken: "short", grpcToken: strings.Repeat("g", 32)},
		{publishToken: strings.Repeat("p", 32), grpcToken: "short"},
		{publishToken: strings.Repeat("s", 32), grpcToken: strings.Repeat("s", 32)},
	}
	for _, config := range invalid {
		if err := validateRuntimeCredentialSeparation(config); !errors.Is(err, errInvalidRuntimeCredentials) {
			t.Fatalf("unexpected validation result: %v", err)
		}
	}
}
