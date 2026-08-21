import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { SAMPLE_DASHBOARD_STREAMS as DEFAULT_DASHBOARD_STREAMS } from "@dashboard/stories/dashboardSampleStreams";
import { SelectedStreamPanel } from "./SelectedStreamPanel";
import { StreamGrid } from "./StreamGrid";

function BrokenCard(stream: DashboardStreamSlot) {
  if (stream.id === "raw.sample.thermal") {
    throw new Error("mock stream card failure");
  }
  return <button type="button">{stream.title}</button>;
}

describe("StreamGrid", () => {
  test("renders default stream slots offline until registry discovery", () => {
    render(
      <StreamGrid
        onSelectStream={() => undefined}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "스트리밍 4 선택" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText("오프라인")).toHaveLength(DEFAULT_DASHBOARD_STREAMS.length);
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

    render(
      <StreamGrid
        onSelectStream={() => undefined}
        renderCard={(stream) => <BrokenCard {...stream} />}
        selectedStreamId="raw.sample.front"
        streams={DEFAULT_DASHBOARD_STREAMS}
      />,
    );

    expect(screen.getByRole("alert", { name: "스트리밍 2 복구" })).toHaveTextContent("이 스트림 패널만 격리되었습니다.");
    expect(screen.getByRole("button", { name: "스트리밍 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 3" })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("SelectedStreamPanel", () => {
  test("renders selected stream as an independent main stream widget", () => {
    render(<SelectedStreamPanel stream={{ ...DEFAULT_DASHBOARD_STREAMS[2], status: "online" }} />);

    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.getByText("스트리밍 3")).toBeInTheDocument();
    expect(screen.getByText("AI 감지 overlay")).toBeInTheDocument();
  });

  test("hides internal stream diagnostics in the selected stream header and overlay", () => {
    render(
      <SelectedStreamPanel
        stream={{
          ...DEFAULT_DASHBOARD_STREAMS[0],
          status: "online",
          detail: "raw.device.pub_secret (webRTCSession, readers 3)",
        }}
      />,
    );

    expect(screen.queryByText(/raw\.device|webRTCSession|readers 3/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("스트리밍 1").length).toBeGreaterThan(0);
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
