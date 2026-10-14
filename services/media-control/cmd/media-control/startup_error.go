package main

import (
	"errors"
	"fmt"
)

const defaultStartupErrorCode = "runtime_failed"

type startupError struct {
	stage string
	cause error
}

func newStartupError(stage string, cause error) error {
	return startupError{stage: stage, cause: cause}
}

func (e startupError) Error() string {
	return fmt.Sprintf("media-control startup failed at %s", e.stage)
}

func (e startupError) Unwrap() error {
	return e.cause
}

func startupErrorCode(err error) string {
	var startupFailure startupError
	if !errors.As(err, &startupFailure) {
		return defaultStartupErrorCode
	}
	return "startup_" + startupFailure.stage + "_failed"
}
