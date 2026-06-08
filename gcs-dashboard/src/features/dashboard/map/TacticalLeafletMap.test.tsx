import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

interface MaplibreTestMock {
  instances: Array<{
    easeTo: ReturnType<typeof vi.fn>;
    emit: (event: string) => void;
    emitError: () => void;
    zoomIn: ReturnType<typeof vi.fn>;
    zoomOut: ReturnType<typeof vi.fn>;
  }>;
  Marker: ReturnType<typeof vi.fn>;
  Map: ReturnType<typeof vi.fn>;
  markers: Array<{
    lngLat: [number, number];
    setLngLat: ReturnType<typeof vi.fn>;
  }>;
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

const remoteStream: DashboardStreamSlot = {
  ...stream,
  id: "raw.remote.drone",
  title: "원격 드론",
  streamPath: "raw.remote.drone",
  geometry: {
    lat: 35.8842,
    lng: 128.6211,
    altitudeM: 42,
    headingDeg: 86,
    pitchDeg: -2,
    rollDeg: 1,
    yawDeg: 86,
    fovDeg: 58,
    source: "telemetry",
  },
};

afterEach(() => {
  maplibreMock().reset();
  vi.unstubAllGlobals();
});

describe("TacticalLeafletMap", () => {
  test("renders the public satellite provider by default and fixes stream pins to GPS coordinates", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(screen.getByTestId("public-tactical-map")).toBeInTheDocument();
    expect(maplibreMock().Map).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [128.601445, 35.871435],
        style: expect.objectContaining({
          layers: [
            {
              id: "satellite",
              source: "satellite",
              type: "raster",
            },
          ],
          sources: {
            satellite: expect.objectContaining({
              tiles: ["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              type: "raster",
            }),
          },
        }),
      }),
    );
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    expect(screen.getByRole("button", { name: /로컬 웹캠 위치/ })).toBeInTheDocument();
    expect(maplibreMock().Marker).toHaveBeenCalledTimes(1);
    expect(maplibreMock().markers[0].setLngLat).toHaveBeenCalledWith([128.601445, 35.871435]);
    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
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

  test("disables auto focus on direct map interaction and restores selected stream focus from the auto button", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      maplibreMock().instances[0].emit("dragstart");
    });

    expect(screen.getByRole("button", { name: "자동 포커스 켜기" })).not.toHaveClass("is-active");

    fireEvent.click(screen.getByRole("button", { name: "자동 포커스 켜기" }));

    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
    expect(maplibreMock().instances[0].easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [128.601445, 35.871435],
      }),
    );
  });

  test("focuses the selected stream GPS while auto focus is enabled", () => {
    const { rerender } = render(<TacticalLeafletMap selectedStream={stream} streams={[stream, remoteStream]} />);

    rerender(<TacticalLeafletMap selectedStream={remoteStream} streams={[stream, remoteStream]} />);

    expect(maplibreMock().instances[0].easeTo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [128.6211, 35.8842],
      }),
    );
  });

  test("falls back to the closed-network offline renderer when public map loading fails", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      maplibreMock().instances[0].emitError();
    });

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
  });

  test("applies the style URL returned by the backend map config API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          provider: "custom",
          styleUrl: "https://maps.example.test/style.json",
          attribution: "Example Maps",
          requiresApiKey: true,
        }),
      })),
    );

    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    await waitFor(() => {
      expect(maplibreMock().Map).toHaveBeenLastCalledWith(
        expect.objectContaining({
          style: "https://maps.example.test/style.json",
        }),
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/map/config",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });
});
