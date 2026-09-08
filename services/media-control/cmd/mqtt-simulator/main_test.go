package main

import (
	"os"
	"path/filepath"
	"testing"

	pb "github.com/gcs-saker/gcs-dashboard-app/services/media-control/internal/generated/gcs/saker/v1"
)

func TestSimulatorScenarioContracts(t *testing.T) {
	config := simulatorConfig{Scenario: "normal", Count: 10, State: simulatorState{DeviceUUID: "device"}}
	request := telemetryRequest(config, 0)
	if request.GroupId != "" || request.AssetId != "device" {
		t.Fatal("normal simulation must not select a group or receiver")
	}
	config.Scenario = "group-mismatch"
	if telemetryRequest(config, 0).GroupId == "" {
		t.Fatal("group mismatch scenario did not create a negative claim")
	}
	for _, scenario := range []string{"forged-token", "group-mismatch", "stale", "ended"} {
		if expectedStatus(scenario) != pb.GatewayAckStatus_GATEWAY_ACK_STATUS_REJECTED {
			t.Fatalf("negative scenario %s does not expect rejection", scenario)
		}
	}
}

func TestLoadStateRejectsMissingSensitiveFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(path, []byte(`{"sessionId":"ps_test"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadState(path); err == nil {
		t.Fatal("incomplete state accepted")
	}
}
