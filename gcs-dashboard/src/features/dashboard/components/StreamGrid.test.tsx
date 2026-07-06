import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DEFAULT_DASHBOARD_STREAMS, type DashboardStreamSlot } from "@dashboard/streamTypes";
import { SelectedStreamPanel } from "./SelectedStreamPanel";
import { StreamGrid } from "./StreamGrid";

describe("StreamGrid", () => {
  test("renders stream cards with independent status badges", () => {
    render(
      <StreamGrid
        onSelectStream={() => undefined}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "스트리밍 4 선택" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Fallback")).toBeInTheDocument();
    expect(screen.getByText("오프라인")).toBeInTheDocument();
  });

  test("notifies selected stream changes without owning dashboard state", async () => {
    const user = userEvent.setup();
    const onSelectStream = vi.fn();

    render(
      <StreamGrid
        onSelectStream={onSelectStream}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    await user.click(screen.getByRole("button", { name: "스트리밍 3 선택" }));

    expect(onSelectStream).toHaveBeenCalledWith("raw.sample.rear");
  });

  test("contains a broken stream card without collapsing the grid", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function BrokenCard(stream: DashboardStreamSlot) {
      if (stream.id === "raw.sample.thermal") {
        throw new Error("mock stream card failure");
      }
      return <button type="button">{stream.title}</button>;
    }

    render(
      <StreamGrid
        onSelectStream={() => undefined}
        renderCard={(stream) => <BrokenCard {...stream} />}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("이 스트림 패널만 격리되었습니다.");
    expect(screen.getByRole("button", { name: "스트리밍 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 3" })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("SelectedStreamPanel", () => {
  test("renders selected stream as an independent main stream widget", () => {
    render(<SelectedStreamPanel stream={DEFAULT_DASHBOARD_STREAMS[2]} />);

    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.getByText("스트리밍 3")).toBeInTheDocument();
    expect(screen.getByText("AI 감지 overlay")).toBeInTheDocument();
  });

  test("marks the stream card that is receiving audio", () => {
    render(
      <StreamGrid
        audioActiveStreamId="raw.sample.front"
        onSelectStream={() => undefined}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" }).closest(".stream-card")).toHaveClass("has-audio");
    expect(screen.getByText("음성")).toBeInTheDocument();
  });

  test("toggles talkback target selection independently from stream focus", async () => {
    const user = userEvent.setup();
    const onSelectStream = vi.fn();
    const onToggleTalkbackTarget = vi.fn();

    render(
      <StreamGrid
        onSelectStream={onSelectStream}
        onToggleTalkbackTarget={onToggleTalkbackTarget}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
        talkbackTargetStreamIds={["raw.sample.rear"]}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "음성 송신 대상" })[0]);

    expect(onToggleTalkbackTarget).toHaveBeenCalledWith("raw.sample.front");
    expect(onSelectStream).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "음성 송신 대상" })[2]).toHaveAttribute("aria-pressed", "true");
  });
});
