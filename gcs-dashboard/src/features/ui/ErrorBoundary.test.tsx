import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_BOUNDARY_EVENT_NAME, type ErrorBoundaryTelemetry } from "./errorBoundaryContracts";
import { DashboardErrorBoundary } from "./ErrorBoundary";

function MaybeBroken({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("panel failed Bearer test-token");
  }
  return <strong>복구된 패널</strong>;
}

function RecoverableBoundaryHarness() {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <DashboardErrorBoundary
      boundaryId="test:panel"
      onReset={() => setShouldThrow(false)}
      scope="panel"
      title="테스트 패널"
    >
      <MaybeBroken shouldThrow={shouldThrow} />
    </DashboardErrorBoundary>
  );
}

describe("DashboardErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders recovery UI and resets the failed child", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const user = userEvent.setup();

    render(<RecoverableBoundaryHarness />);

    expect(screen.getByRole("alert", { name: "테스트 패널 복구" })).toHaveTextContent("격리됨");

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(screen.getByText("복구된 패널")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
  });

  it("dispatches sanitized telemetry for observability wiring", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(ERROR_BOUNDARY_EVENT_NAME, listener);

    render(
      <DashboardErrorBoundary boundaryId="test:telemetry" scope="panel" title="관측 패널">
        <MaybeBroken shouldThrow />
      </DashboardErrorBoundary>,
    );

    const detail = (listener.mock.calls[0][0] as CustomEvent<ErrorBoundaryTelemetry>).detail;
    expect(detail.boundaryId).toBe("test:telemetry");
    expect(detail.message).not.toContain("test-token");
    expect(detail.scope).toBe("panel");

    window.removeEventListener(ERROR_BOUNDARY_EVENT_NAME, listener);
    expect(consoleError).toHaveBeenCalled();
  });
});
