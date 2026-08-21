import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { CctvChannelCard } from "./CctvChannelCard";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

vi.mock("@streaming/components/RealtimePlayer", () => ({
  RealtimePlayer: ({ streamId }: { streamId: string }) => <div data-testid="cctv-player">{streamId}</div>,
}));

const LIVE_STREAM: DashboardStreamSlot = {
  id: "opaque-live",
  title: "CCTV 01",
  status: "online",
  mode: "EO",
  detail: "전방 카메라",
  connectedDeviceId: "opaque-device",
  streamPath: "opaque-live",
  geometry: null,
};

describe("CctvChannelCard", () => {
  test("renders actual playback for a receivable stream without fabricated metrics", async () => {
    const onSelect = vi.fn();
    render(<CctvChannelCard hasAudioActivity={false} isSelected={false} onSelect={onSelect}
      qualityMode="preview" stream={LIVE_STREAM} />);

    expect(screen.getByTestId("cctv-player")).toHaveTextContent("opaque-live");
    expect(screen.queryByText(/FPS|42ms|녹화 준비/)).not.toBeInTheDocument();
    expect(screen.getAllByText("실시간 수신")).toHaveLength(2);
    expect(screen.getByText("간소 보기")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "CCTV 01 선택" }));
    expect(onSelect).toHaveBeenCalledWith("opaque-live");
  });
});
