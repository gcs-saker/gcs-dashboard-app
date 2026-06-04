import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

interface MaplibreTestMock {
  instances: Array<{
    easeTo: ReturnType<typeof vi.fn>;
    emitError: () => void;
    zoomIn: ReturnType<typeof vi.fn>;
    zoomOut: ReturnType<typeof vi.fn>;
  }>;
  Map: ReturnType<typeof vi.fn>;
  reset: () => void;
}

declare global {
  var __gcsMaplibreMock: MaplibreTestMock;
}

function maplibreMock(): MaplibreTestMock {
  return globalThis.__gcsMaplibreMock;
}

const stream: DashboardStreamSlot = {
  id: "raw.local.webcam",
  title: "로컬 웹캠",
  status: "online",
  mode: "EO",
  detail: "closed network map test",
  streamPath: "raw.local.webcam",
  geometry: {
    lat: 35.871435,
    lng: 128.601445,
    altitudeM: 12,
    headingDeg: 24,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 24,
    fovDeg: 64,
    source: "telemetry",
  },
};

afterEach(() => {
  maplibreMock().reset();
});

describe("TacticalLeafletMap", () => {
  test("renders the free public OpenFreeMap provider by default", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(screen.getByTestId("public-tactical-map")).toBeInTheDocument();
    expect(maplibreMock().Map).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [128.601445, 35.871435],
        style: "https://tiles.openfreemap.org/styles/liberty",
      }),
    );
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    expect(screen.getByRole("button", { name: /로컬 웹캠 위치/ })).toBeInTheDocument();
  });

  test("keeps zoom controls bound to the public vector map renderer", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(maplibreMock().instances[0].zoomIn).toHaveBeenCalledTimes(1);
    expect(maplibreMock().instances[0].zoomOut).toHaveBeenCalledTimes(1);
    expect(maplibreMock().instances[0].easeTo).toHaveBeenCalled();
  });

  test("falls back to the closed-network offline renderer when public map loading fails", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      maplibreMock().instances[0].emitError();
    });

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
  });
});
