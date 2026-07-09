import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DASHBOARD_WIDGET_REGISTRY } from "@dashboard/dashboardLayout";
import { getMapFocusForStream } from "@dashboard/mapFocus";
import { DEFAULT_DASHBOARD_STREAMS } from "@dashboard/streamTypes";
import { DashboardMainGrid } from "./DashboardMainGrid";

function BrokenMap(): never {
  throw new Error("map render failed");
}

describe("DashboardMainGrid error isolation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps stream panels usable when the map widget fails", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const selectedStream = DEFAULT_DASHBOARD_STREAMS[0];

    render(
      <DashboardMainGrid
        aiResultsWidget={DASHBOARD_WIDGET_REGISTRY["ai-results"]}
        audioActiveStreamId={null}
        audioAnalysis={null}
        isWidgetPinned={() => false}
        isWidgetVisible={(widgetId) => widgetId !== "ai-results"}
        mapFocus={getMapFocusForStream(selectedStream)}
        motionEnabled
        onPlaybackStatusChange={() => undefined}
        onSelectMapStream={() => undefined}
        onSelectStream={() => undefined}
        onToggleAiMode={() => undefined}
        onToggleTalkbackTarget={() => undefined}
        opsSummaryWidget={DASHBOARD_WIDGET_REGISTRY["ops-summary"]}
        panelClass={(baseClass) => baseClass}
        selectedStream={selectedStream}
        selectedStreamId={selectedStream.id}
        streams={DEFAULT_DASHBOARD_STREAMS}
        tacticalMap={BrokenMap}
        tacticalMapWidget={DASHBOARD_WIDGET_REGISTRY["tactical-map"]}
        talkbackTargetStreamIds={[]}
        telemetryRows={[]}
        telemetryWidget={DASHBOARD_WIDGET_REGISTRY["telemetry-panel"]}
        widgetControls={() => null}
      />,
    );

    expect(screen.getByRole("alert", { name: "지도 복구" })).toHaveTextContent("지도 패널만 격리되었습니다.");
    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toBeInTheDocument();
  });
});
