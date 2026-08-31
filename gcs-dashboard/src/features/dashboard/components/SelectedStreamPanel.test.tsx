import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import { SelectedStreamPanel } from "./SelectedStreamPanel";

vi.mock("@streaming/components/RealtimePlayer", () => ({
  RealtimePlayer: ({ onStatusChange }: { onStatusChange?: (snapshot: RealtimePlayerSnapshot) => void }) => (
    <button data-testid="complete-whep" onClick={() => onStatusChange?.({
      errorMessage: null,
      mode: "webrtc",
      streamStatus: "online",
      webrtcSignalingComplete: true,
    })} type="button">WHEP ready</button>
  ),
}));

vi.mock("@dashboard/hooks/useStreamCameraControl", () => ({
  useStreamCameraControl: () => ({ message: null, pendingMode: null, requestFacingMode: vi.fn() }),
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
  test("toggles the selected stream as a talkback target", () => {
    const onToggleTalkbackTarget = vi.fn();
    render(<SelectedStreamPanel onToggleTalkbackTarget={onToggleTalkbackTarget} stream={STREAM} />);

    const button = screen.getByRole("button", { name: "음성 송신 대상" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByTestId("complete-whep"));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onToggleTalkbackTarget).toHaveBeenCalledWith("raw.mobile.front");
  });
});
