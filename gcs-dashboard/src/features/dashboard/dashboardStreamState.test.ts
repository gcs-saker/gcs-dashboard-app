import { describe, expect, test } from "vitest";

import { areStreamDevicesEqual, areStreamSlotsEqual, ensureEditableCctvSlot } from "./dashboardStreamState";
import { DEFAULT_DASHBOARD_STREAMS, type DashboardStreamGeometry, type DashboardStreamSlot } from "./streamTypes";
import type { StreamDeviceOption } from "./streamDeviceContracts";

const BASE_GEOMETRY: DashboardStreamGeometry = {
  lat: 35.871435,
  lng: 128.601445,
  altitudeM: 120,
  headingDeg: 130,
  pitchDeg: -2.1,
  rollDeg: 1.3,
  yawDeg: 127,
  fovDeg: 72,
  source: "mock",
};

function streamSlot(overrides: Partial<DashboardStreamSlot> = {}): DashboardStreamSlot {
  return {
    id: "raw.sample.front",
    title: "스트리밍 1",
    status: "online",
    mode: "EO",
    detail: "전방 EO / raw.sample.front",
    connectedDeviceId: "device-drn-01-front",
    streamPath: "raw.sample.front",
    geometry: BASE_GEOMETRY,
    ...overrides,
  };
}

function streamDevice(overrides: Partial<StreamDeviceOption> = {}): StreamDeviceOption {
  return {
    id: "device-drn-01-front",
    name: "DRN-01 전방 EO",
    mediaType: "eo",
    status: "online",
    streamPath: "raw.sample.front",
    geometry: BASE_GEOMETRY,
    ...overrides,
  };
}

describe("dashboardStreamState", () => {
  test("creates an editable CCTV placeholder only for valid empty CCTV ids", () => {
    const streams = DEFAULT_DASHBOARD_STREAMS.slice(0, 1);

    const nextStreams = ensureEditableCctvSlot(streams, "cctv-empty-7");

    expect(nextStreams).toHaveLength(2);
    expect(nextStreams[1]).toMatchObject({
      id: "cctv-empty-7",
      title: "CCTV 07",
      status: "offline",
      connectedDeviceId: null,
      streamPath: null,
    });
  });

  test("does not create duplicate or malformed CCTV placeholders", () => {
    const streams = ensureEditableCctvSlot([], "cctv-empty-2");

    expect(ensureEditableCctvSlot(streams, "cctv-empty-2")).toBe(streams);
    expect(ensureEditableCctvSlot(streams, "raw.sample.front")).toBe(streams);
    expect(ensureEditableCctvSlot(streams, "cctv-empty-0")).toBe(streams);
    expect(ensureEditableCctvSlot(streams, "cctv-empty-x")).toBe(streams);
  });

  test("compares stream devices by ordered identity and geometry fields", () => {
    const first = streamDevice();
    const same = streamDevice({ geometry: { ...BASE_GEOMETRY } });
    const moved = streamDevice({ geometry: { ...BASE_GEOMETRY, headingDeg: 131 } });

    expect(areStreamDevicesEqual([first], [same])).toBe(true);
    expect(areStreamDevicesEqual([first], [moved])).toBe(false);
    expect(areStreamDevicesEqual([first], [same, moved])).toBe(false);
  });

  test("compares stream slots by runtime metadata and optional geometry", () => {
    const first = streamSlot();
    const same = streamSlot({ geometry: { ...BASE_GEOMETRY } });
    const changedAiMode = streamSlot({ aiModeEnabled: true });
    const noGeometry = streamSlot({ geometry: null });

    expect(areStreamSlotsEqual([first], [same])).toBe(true);
    expect(areStreamSlotsEqual([first], [changedAiMode])).toBe(false);
    expect(areStreamSlotsEqual([first], [noGeometry])).toBe(false);
    expect(areStreamSlotsEqual([noGeometry], [streamSlot({ geometry: null })])).toBe(true);
  });
});
