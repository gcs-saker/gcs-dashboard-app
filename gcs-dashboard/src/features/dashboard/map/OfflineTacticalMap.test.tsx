import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import { OfflineTacticalMap } from "./OfflineTacticalMap";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

const STREAM: DashboardStreamSlot = {
  detail: "전방",
  geometry: {
    altitudeM: 34,
    fovDeg: 72,
    headingDeg: 7,
    lat: 35.87143,
    lng: 128.60144,
    pitchDeg: 0,
    rollDeg: 0,
    source: "telemetry",
    yawDeg: 7,
  },
  id: "stream-1",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "raw.mobile.front",
  title: "전방 카메라",
};

describe("OfflineTacticalMap", () => {
  test("renders closed-network map coordinates and stream marker pins", async () => {
    const user = userEvent.setup();
    const onAutoFocusChange = vi.fn();
    const onStreamMarkerSelect = vi.fn();

    render(
      <OfflineTacticalMap
        activeStreamId={null}
        autoFocusEnabled={true}
        fallbackNotice="오프라인 타일 사용 중"
        onAutoFocusChange={onAutoFocusChange}
        onStreamMarkerSelect={onStreamMarkerSelect}
        onStreamPopupClose={vi.fn()}
        selectedStream={STREAM}
        streams={[STREAM]}
      />,
    );

    expect(screen.getByTestId("offline-tactical-map")).toHaveAccessibleName("폐쇄망 오프라인 전술 지도");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871430, 128.601440");
    expect(screen.getByRole("status")).toHaveTextContent("오프라인 타일 사용 중");

    await user.click(screen.getByRole("button", { name: /전방 카메라 위치/ }));
    await user.click(screen.getByRole("button", { name: "지도 확대" }));

    expect(onStreamMarkerSelect).toHaveBeenCalledWith("stream-1");
    expect(onAutoFocusChange).toHaveBeenCalledWith(true);
  });

  test("shows stream popup for the active stream", () => {
    render(
      <OfflineTacticalMap
        activeStreamId="stream-1"
        autoFocusEnabled={false}
        fallbackNotice={null}
        onAutoFocusChange={vi.fn()}
        onStreamMarkerSelect={vi.fn()}
        onStreamPopupClose={vi.fn()}
        selectedStream={STREAM}
        streams={[STREAM]}
      />,
    );

    expect(screen.getByLabelText("전방 카메라 단말 정보")).toHaveTextContent("전방 카메라");
    expect(screen.getByLabelText("전방 카메라 단말 정보")).toHaveTextContent("35.871430");
  });
});
