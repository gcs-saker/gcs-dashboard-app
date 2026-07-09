import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { getDashboardWidgetDefinition } from "@dashboard/dashboardLayout";
import { AiResultsPanel } from "./AiResultsPanel";

describe("AiResultsPanel", () => {
  test("renders the placeholder AI overlay result contract", () => {
    render(
      <AiResultsPanel
        controls={<button type="button">도구</button>}
        panelClassName="ops-panel ai-panel"
        widget={getDashboardWidgetDefinition("ai-results")}
      />,
    );

    expect(screen.getByRole("heading", { name: "AI 결과" })).toBeInTheDocument();
    expect(screen.getByText("대기")).toBeInTheDocument();
    expect(screen.getByText("person / 0.72")).toBeInTheDocument();
    expect(screen.getByText("중간")).toBeInTheDocument();
    expect(screen.getByText("42 ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "도구" })).toBeInTheDocument();
  });
});
