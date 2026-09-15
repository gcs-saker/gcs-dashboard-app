package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

const (
	healthcheckCommand = "healthcheck"
	healthcheckURL     = "http://127.0.0.1:8081/healthz"
	healthcheckTimeout = 2 * time.Second
)

func isHealthcheckCommand(arguments []string) bool {
	return len(arguments) == 2 && arguments[1] == healthcheckCommand
}

func runHealthcheck() int {
	client := http.Client{Timeout: healthcheckTimeout}
	response, err := client.Get(healthcheckURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "media-control healthcheck failed: %T\n", err)
		return 1
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		fmt.Fprintf(os.Stderr, "media-control healthcheck returned status %d\n", response.StatusCode)
		return 1
	}
	return 0
}
