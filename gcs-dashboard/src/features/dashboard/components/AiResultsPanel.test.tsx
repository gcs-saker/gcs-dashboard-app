import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { getDashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";
import { AiResultsPanel } from "./AiResultsPanel";

describe("AiResultsPanel", () => {
  test("does not render fabricated AI results without metadata", () => {
    render(
      <AiResultsPanel
        controls={<button type="button">도구</button>}
        panelClassName="ops-panel ai-panel"
        widget={getDashboardWidgetDefinition("ai-results")}
      />,
    );

    expect(screen.getByRole("heading", { name: "AI 결과" })).toBeInTheDocument();
    expect(screen.getByText("결과 없음")).toBeInTheDocument();
    expect(screen.getByText(/검증된 AI metadata/)).toBeInTheDocument();
    expect(screen.queryByText(/person/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도구" })).toBeInTheDocument();
  });

  test("renders validated detection summaries", () => {
    render(<AiResultsPanel analysis={{ detections: [{ confidence: 0.91, label: "person", riskScore: 0.82 }],
      generatedAt: "2026-08-21T00:00:00Z", processingLatencyMs: 42,
      reportText: "사람이 감지되었습니다.", riskScore: 0.82 }} controls={null}
      panelClassName="ops-panel ai-panel" widget={getDashboardWidgetDefinition("ai-results")} />);

    expect(screen.getByText("person")).toBeInTheDocument();
    expect(screen.getByText("신뢰도 91% · 위험도 82%")).toBeInTheDocument();
    expect(screen.getByText("42 ms")).toBeInTheDocument();
  });
});
