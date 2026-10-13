package main

import (
	"fmt"
	"os"
	"strings"
	"syscall"
)

const maximumSecretBytes = 4096

func main() {
	if err := loadRequiredSecret("MEDIAMTX_API_PASSWORD"); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	arguments := append([]string{"/mediamtx"}, os.Args[1:]...)
	if err := syscall.Exec(arguments[0], arguments, os.Environ()); err != nil {
		fmt.Fprintln(os.Stderr, "MediaMTX entrypoint failed")
		os.Exit(1)
	}
}

func loadRequiredSecret(name string) error {
	path := "/run/secrets/" + name
	if strings.TrimSpace(os.Getenv(name)) != "" {
		return fmt.Errorf("%s environment input is forbidden", name)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("%s secret cannot be read", name)
	}
	if len(contents) == 0 || len(contents) > maximumSecretBytes {
		return fmt.Errorf("%s secret size is invalid", name)
	}
	value := strings.TrimSpace(string(contents))
	if value == "" {
		return fmt.Errorf("%s secret must not be empty", name)
	}
	return os.Setenv(name, value)
}
