import { describe, expect, it } from "vitest";
import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";
import { buildCctvGridStreams, getCctvGridSize, isReceivableStream, summarizeCctvStatus } from "@dashboard/streaming/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

const liveStream: DashboardStreamSlot = {
  detail: "front camera",
  id: "raw.live.front",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "raw.live.front",
  title: "Live Front",
};

describe("dashboardCctv", () => {
  it("maps layout mode to a stable grid size", () => {
    expect(getCctvGridSize("3x3")).toBe(3);
    expect(getCctvGridSize("4x4")).toBe(4);
    expect(getCctvGridSize("5x5")).toBe(5);
    expect(getCctvGridSize("auto")).toBe(4);
  });

  it("fills empty CCTV slots without resizing the grid", () => {
    const streams = buildCctvGridStreams([liveStream], 3);

    expect(streams).toHaveLength(9);
    expect(streams[0]).toBe(liveStream);
    expect(streams[1].id).toBe("cctv-empty-2");
    expect(streams[8].title).toBe("CCTV 09");
  });

  it("excludes synthetic and offline streams from availability notifications", () => {
    expect(isReceivableStream(liveStream)).toBe(true);
    expect(isReceivableStream({ ...liveStream, id: "cctv-empty-1" })).toBe(false);
    expect(isReceivableStream({ ...liveStream, status: DASHBOARD_STREAM_STATUS.offline })).toBe(false);
  });

  it("summarizes CCTV stream status without leaking UI counting logic into the page", () => {
    expect(summarizeCctvStatus([
      liveStream,
      { ...liveStream, id: "raw.live.thermal", status: DASHBOARD_STREAM_STATUS.fallback },
      { ...liveStream, id: "raw.live.rear", status: DASHBOARD_STREAM_STATUS.offline },
      { ...liveStream, id: "raw.live.reconnect", status: DASHBOARD_STREAM_STATUS.reconnecting },
    ])).toEqual({
      fallback: 1,
      offline: 1,
      online: 1,
    });
  });
});
