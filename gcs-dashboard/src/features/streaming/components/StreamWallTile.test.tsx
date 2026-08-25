import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StreamWallTile } from "./StreamWallTile";
import type { StreamSlot } from "@streaming/layout/streamModel";

vi.mock("./RealtimePlayer", () => ({ RealtimePlayer: ({ title }: { title: string }) => <div>{title}</div> }));

const stream: StreamSlot = {
  id: "slot-1", title: "현장 카메라", status: "online", mode: "EO", detail: "",
  streamPath: "raw.mobile.front", geometry: { lat: 35.1, lng: 128.2, altitudeM: 10,
    headingDeg: 90, rollDeg: 1, pitchDeg: 2, yawDeg: 90, source: "telemetry" }, aiModeEnabled: false,
};

describe("StreamWallTile", () => {
  test("uses aliases, telemetry, selection, and AI controls for an online stream", () => {
    const onSelect = vi.fn();
    const onToggleAi = vi.fn();
    render(<StreamWallTile index={0} onSelect={onSelect} onToggleAi={onToggleAi} stream={stream} streams={[stream]} />);

    expect(screen.getAllByText("현장 카메라")).toHaveLength(2);
    expect(screen.getByLabelText("스트림 텔레메트리")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "1번 화면 AI 모드" }));

    expect(onSelect).toHaveBeenCalledWith(0, null);
    expect(onToggleAi).toHaveBeenCalledWith("slot-1");
  });

  test("renders a clean empty tile without stale telemetry", () => {
    render(<StreamWallTile index={1} onSelect={vi.fn()} onToggleAi={vi.fn()} stream={null} streams={[stream]} />);
    expect(screen.queryByLabelText("스트림 텔레메트리")).not.toBeInTheDocument();
    expect(screen.getByText("표시할 스트림을 선택하세요")).toBeInTheDocument();
  });
});
