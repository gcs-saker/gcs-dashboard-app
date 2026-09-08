import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { DASHBOARD_WIDGET_REGISTRY } from "@dashboard/layout/dashboardLayout";
import { telemetryRowsForStream } from "@dashboard/layout/dashboardPresentation";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { TelemetryPanel } from "./TelemetryPanel";

const TELEMETRY_STREAM: DashboardStreamSlot = {
  id: "opaque-stream",
  title: "스트리밍 1",
  detail: "전방 카메라",
  mode: "EO",
  status: "online",
  streamPath: "internal-stream",
  geometry: {
    lat: 36.11995,
    lng: 128.36337,
    altitudeM: 85.4,
    batteryPercent: 79,
    headingDeg: 325,
    pitchDeg: 43.8,
    rollDeg: 18.9,
    yawDeg: 194,
    fovDeg: 60,
    source: "telemetry",
  },
};

describe("TelemetryPanel", () => {
  test("shows the selected stream telemetry beside the compass", () => {
    render(
      <TelemetryPanel
        controls={null}
        isPinned={false}
        rows={telemetryRowsForStream(TELEMETRY_STREAM)}
        stream={TELEMETRY_STREAM}
        widget={DASHBOARD_WIDGET_REGISTRY["telemetry-panel"]}
      />,
    );

    const panel = screen.getByLabelText("지오메트리 / 텔레메트리");
    expect(within(panel).getByText("36.119950, 128.363370")).toBeInTheDocument();
    expect(within(panel).getAllByText("85.4 m")).toHaveLength(2);
    expect(within(panel).getByText("79%")).toBeInTheDocument();
    expect(within(panel).getByText("R 18.9° · P 43.8° · Y 194°")).toBeInTheDocument();
    expect(within(panel).getByLabelText("기체 방위와 지도 기준 방위")).toHaveTextContent("기체 325deg");
  });
});
