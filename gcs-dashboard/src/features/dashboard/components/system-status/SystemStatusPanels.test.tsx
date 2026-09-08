import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import type { DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import type { RttChart, RttStats } from "@dashboard/operations/systemStatusRtt";
import { SystemServiceCards } from "./SystemServiceCards";
import { SystemStatusPrimaryPanel } from "./SystemStatusPrimaryPanel";
import { SystemRttPanel } from "./SystemRttPanel";
import { SystemStatusAlert, SystemStatusPageHero } from "./SystemStatusPageHero";

const ONLINE_STATUS: DashboardServerStatusSnapshot = {
  apiServer: "online",
  authServer: "online",
  signalingServer: "online",
  readiness: "online",
  streams: "online",
  latencyMs: 32,
  checkedAt: 1_782_489_600_000,
};

const RTT_CHART: RttChart = {
  oldestLabel: "2분 전",
  path: "M 28.0 120.0 L 612.0 48.0",
  points: [
    { checkedAt: 1, latencyMs: 120, x: 28, y: 120 },
    { checkedAt: 2, latencyMs: 520, x: 612, y: 48 },
  ],
};

const RTT_STATS: RttStats = {
  avgLatencyMs: 320,
  maxLatencyMs: 520,
  minLatencyMs: 120,
};

describe("system status panels", () => {
  test("renders the page hero without an alert for healthy status", () => {
    render(
      <>
        <SystemStatusPageHero readinessText="정상" status={ONLINE_STATUS} />
        <SystemStatusAlert status={ONLINE_STATUS} />
      </>,
    );

    expect(screen.getByRole("heading", { name: "서버 상태" })).toBeInTheDocument();
    expect(screen.getByText("전체 정상")).toHaveClass("is-online");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("renders degraded status as an operator-visible alert", () => {
    render(
      <SystemStatusAlert
        status={{
          ...ONLINE_STATUS,
          readiness: DASHBOARD_SERVER_HEALTH.degraded,
        }}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("서버 상태 확인 필요");
    expect(screen.getByRole("alert")).toHaveTextContent("저하 상태입니다");
  });

  test("renders RTT trend with overlay stats and warning points", () => {
    render(
      <SystemRttPanel
        latestRttText="520 ms"
        rttChart={RTT_CHART}
        rttMax={600}
        rttStats={RTT_STATS}
      />,
    );

    expect(screen.getByRole("img", { name: "최근 RTT 추세, 현재 520 ms" })).toBeInTheDocument();
    expect(screen.getByText("최저")).toBeInTheDocument();
    expect(screen.getByText("120 ms")).toBeInTheDocument();
    expect(screen.getByText("평균")).toBeInTheDocument();
    expect(screen.getByText("320 ms")).toBeInTheDocument();
    expect(screen.getByText("최고")).toBeInTheDocument();
    expect(screen.getAllByText("520 ms")).toHaveLength(2);
    expect(document.querySelector("circle.is-warning")).not.toBeNull();
  });

  test("renders primary rows and keeps visual status dots hidden from assistive names", () => {
    render(
      <SystemStatusPrimaryPanel
        checkedText="방금 전"
        rows={[
          ["API 서버", "정상", "online"],
          ["Signaling 서버", "주의", "degraded"],
        ]}
        variant="page"
      />,
    );

    expect(screen.getByText("API 서버")).toBeInTheDocument();
    expect(screen.getByText("Signaling 서버")).toBeInTheDocument();
    expect(screen.getByText("업데이트 방금 전")).toBeInTheDocument();
    expect(document.querySelectorAll(".status-dot[aria-hidden='true']")).toHaveLength(2);
  });

  test("renders service cards with explicit status text", () => {
    render(
      <SystemServiceCards
        serviceCards={[
          ["API", "요청 처리", "online"],
          ["Media", "WHEP 경로", "error"],
        ]}
      />,
    );

    expect(screen.getByLabelText("서비스 상태 카드")).toHaveTextContent("API");
    expect(screen.getByLabelText("서비스 상태 카드")).toHaveTextContent("요청 처리");
    expect(screen.getByLabelText("서비스 상태 카드")).toHaveTextContent("오류");
  });
});
