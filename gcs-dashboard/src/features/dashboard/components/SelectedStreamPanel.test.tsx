import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { SelectedStreamPanel } from "./SelectedStreamPanel";

vi.mock("@streaming/components/RealtimePlayer", () => ({
  RealtimePlayer: () => <div data-testid="selected-player" />,
}));

const STREAM: DashboardStreamSlot = {
  id: "device-1",
  title: "스트리밍 1",
  status: "online",
  mode: "EO",
  detail: "전면 카메라",
  streamPath: "raw.mobile.front",
};

describe("SelectedStreamPanel", () => {
  test("selects the active stream as a talkback target", () => {
    const onToggleTalkbackTarget = vi.fn();
    render(
      <SelectedStreamPanel
        isTalkbackTarget={false}
        onToggleTalkbackTarget={onToggleTalkbackTarget}
        stream={STREAM}
      />,
    );

    const button = screen.getByRole("button", { name: "음성 송신 대상" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onToggleTalkbackTarget).toHaveBeenCalledWith("raw.mobile.front");
  });

  test("marks an already selected talkback target", () => {
    render(<SelectedStreamPanel isTalkbackTarget stream={STREAM} />);
    expect(screen.getByRole("button", { name: "음성 송신 대상" })).toHaveAttribute("aria-pressed", "true");
  });
});
