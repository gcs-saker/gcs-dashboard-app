package main

import "testing"

func TestIsHealthcheckCommand(t *testing.T) {
	if !isHealthcheckCommand([]string{"media-control", "healthcheck"}) {
		t.Fatal("expected healthcheck command")
	}
	if isHealthcheckCommand([]string{"media-control"}) {
		t.Fatal("unexpected healthcheck command")
	}
}
