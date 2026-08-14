import { describe, expect, it } from "vitest";

import {
  diagnoseOperationalEventAction,
  diagnoseOperationalEventCause,
  diagnoseOperationalEventImpact,
  formatOperationalEventPayload,
  summarizeEventCategories,
} from "@dashboard/operations/eventLogPresentation";
import type { OperationalEvent } from "@dashboard/operations/operationalEvents";

const networkEvent: OperationalEvent = {
  category: "network",
  connectionId: "conn-001",
  connections: 5,
  eventType: "ice.relay_fallback",
  icePath: "relay",
  id: "evt-network",
  latencyMs: 164,
  message: "직접 ICE 후보 실패 후 릴레이 경로 사용",
  occurredAt: "2026-06-01T00:12:00Z",
  relayFallbackReason: "srflx candidate failed",
  severity: "warn",
  source: "TURN 릴레이",
  sourceService: "turn",
  streamId: "raw/local/webcam",
  throughputMbps: 31.6,
};

describe("eventLogPresentation", () => {
  it("keeps operation diagnosis rules outside the React component", () => {
    expect(diagnoseOperationalEventCause(networkEvent)).toContain("TURN fallback");
    expect(diagnoseOperationalEventImpact(networkEvent)).toContain("기능 저하");
    expect(diagnoseOperationalEventAction(networkEvent)).toContain("TURN 사용률");
  });

  it("summarizes known categories with zero-filled missing values", () => {
    expect(summarizeEventCategories([networkEvent])).toEqual([
      { category: "api", count: 0 },
      { category: "signaling", count: 0 },
      { category: "network", count: 1 },
      { category: "stream", count: 0 },
      { category: "security", count: 0 },
    ]);
  });

  it("formats operational event payload fields for raw inspection", () => {
    expect(formatOperationalEventPayload(networkEvent)).toContain("icePath=relay");
    expect(formatOperationalEventPayload(networkEvent)).toContain("latencyMs=164");
    expect(formatOperationalEventPayload(networkEvent)).toContain("throughputMbps=31.6");
  });
});
