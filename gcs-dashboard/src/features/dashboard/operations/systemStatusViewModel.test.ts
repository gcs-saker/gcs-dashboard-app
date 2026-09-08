import { describe, expect, it } from "vitest";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import { buildSystemStatusViewModel } from "@dashboard/operations/systemStatusViewModel";
import type { DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";

const checkedAt = new Date("2026-06-01T00:00:00Z").getTime();

const degradedStatus: DashboardServerStatusSnapshot = {
  apiServer: DASHBOARD_SERVER_HEALTH.online,
  authServer: DASHBOARD_SERVER_HEALTH.degraded,
  checkedAt,
  latencyMs: 180,
  readiness: DASHBOARD_SERVER_HEALTH.degraded,
  signalingServer: DASHBOARD_SERVER_HEALTH.online,
  streams: DASHBOARD_SERVER_HEALTH.error,
};

describe("systemStatusViewModel", () => {
  it("builds status rows and service cards from a single server snapshot", () => {
    const model = buildSystemStatusViewModel(degradedStatus, [
      { checkedAt: checkedAt - 60_000, latencyMs: 120 },
      { checkedAt, latencyMs: 180 },
    ]);

    expect(model.primaryRows.map(([label]) => label)).toContain("통합 헬스체크");
    expect(model.serviceCards.find(([name]) => name === "Streams")?.[2]).toBe(DASHBOARD_SERVER_HEALTH.error);
    expect(model.latestRttText).toBe("180 ms");
    expect(model.rttStats.avgLatencyMs).toBe(150);
    expect(model.rttChart.points).toHaveLength(2);
  });

  it("describes degraded dependency impact for operator triage", () => {
    const model = buildSystemStatusViewModel(degradedStatus, []);

    expect(model.readinessText).toBe("저하");
    expect(model.impactItems.find(([name]) => name === "Auth")?.[2]).toContain("로그인");
    expect(model.impactItems.find(([name]) => name === "Streams")?.[2]).toContain("스트림 목록");
  });
});
