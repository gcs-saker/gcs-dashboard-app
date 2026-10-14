package main

import (
	"errors"
	"testing"
)

func TestStartupErrorCodeReportsStageWithoutCauseText(t *testing.T) {
	cause := errors.New("postgres://user:secret@private-host/database")
	err := newStartupError("dependencies", cause)

	if got := startupErrorCode(err); got != "startup_dependencies_failed" {
		t.Fatalf("unexpected startup code: %q", got)
	}
	if got := err.Error(); got != "media-control startup failed at dependencies" {
		t.Fatalf("startup error leaked its cause: %q", got)
	}
	if !errors.Is(err, cause) {
		t.Fatal("startup error must preserve the cause for internal handling")
	}
}

func TestStartupErrorCodeFallsBackForUnclassifiedFailure(t *testing.T) {
	if got := startupErrorCode(errors.New("failure")); got != defaultStartupErrorCode {
		t.Fatalf("unexpected fallback code: %q", got)
	}
}
