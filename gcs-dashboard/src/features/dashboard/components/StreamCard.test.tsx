import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { StreamCard } from "./StreamCard";

vi.mock("@streaming/components/RealtimePlayer", () => ({
  RealtimePlayer: ({ controls, muted, streamId, title }: { controls: boolean; muted: boolean; streamId: string; title: string }) => (
    <div data-controls={controls} data-muted={muted} data-testid={`player-${streamId}`}>{title}</div>
  ),
}));

const STREAM: DashboardStreamSlot = {
  id: "stream-2",
  title: "스트리밍 2",
  status: "online",
  mode: "EO",
  detail: "전방 카메라",
  streamPath: "raw.drone-02.front",
};

describe("StreamCard", () => {
  test("keeps an independent player mounted when the stream is not selected", () => {
    render(<StreamCard stream={STREAM} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByTestId("player-raw.drone-02.front")).toHaveTextContent("스트리밍 2 미리보기");
    expect(screen.getByTestId("player-raw.drone-02.front")).toHaveAttribute("data-muted", "true");
    expect(screen.getByRole("button", { name: "스트리밍 2 선택" })).toHaveAttribute("aria-pressed", "false");
  });

  test("selecting another stream does not turn the grid player into a placeholder", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<StreamCard stream={STREAM} isSelected={true} onSelect={onSelect} />);

    rerender(<StreamCard stream={STREAM} isSelected={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "스트리밍 2 선택" }));

    expect(screen.getByTestId("player-raw.drone-02.front")).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith("stream-2");
  });

  test("does not request playback for an offline registry path", () => {
    render(<StreamCard stream={{ ...STREAM, status: "offline" }} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.queryByTestId("player-raw.drone-02.front")).not.toBeInTheDocument();
    expect(screen.getByText("상태: 스트림 선택 대기")).toBeInTheDocument();
  });
});
