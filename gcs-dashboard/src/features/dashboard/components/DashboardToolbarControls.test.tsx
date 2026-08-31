import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";
import { StreamNotificationToast } from "./atoms/StreamNotificationToast";
import { TalkbackControlPanel } from "./TalkbackControlPanel";

const STREAM_PATH = "opaque-stream-1";
const stream: DashboardStreamSlot = {
  id: "stream-1", title: "현장 영상", status: "online", mode: "EO",
  detail: "현장 영상", streamPath: STREAM_PATH,
};

describe("dashboard toolbar controls", () => {
  test("starts and stops talkback for the selected target", async () => {
    const start = vi.fn(async () => undefined);
    const stop = vi.fn();
    const idle = talkbackSnapshot({ start, stop });
    const { rerender } = render(<TalkbackControlPanel selectedStreamId={stream.id}
      selectedStreamIds={[STREAM_PATH]} streams={[stream]} talkback={idle} />);

    fireEvent.click(screen.getByRole("button", { name: "마이크 송신" }));
    expect(start).toHaveBeenCalledWith([STREAM_PATH]);

    rerender(<TalkbackControlPanel selectedStreamId={stream.id} selectedStreamIds={[STREAM_PATH]}
      streams={[stream]} talkback={{ ...idle, status: "active" }} />);
    fireEvent.click(screen.getByRole("button", { name: "송신 중지" }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("dismisses a stream notification", () => {
    const onDismiss = vi.fn();
    render(<StreamNotificationToast notification={{ id: "notice-1", message: "새 스트림" }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

function talkbackSnapshot(overrides: Partial<TalkbackPublisherSnapshot>): TalkbackPublisherSnapshot {
  return {
    status: "idle", errorMessage: null, hasLocalAudioTrack: false, micLevel: null,
    targets: [{ streamId: STREAM_PATH, status: "active", errorMessage: null }],
    start: async () => undefined, stop: () => undefined, ...overrides,
  };
}
