import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

interface LeafletTestMock {
  instances: Array<{
    emit: (event: string) => void;
    latLngToContainerPoint: ReturnType<typeof vi.fn>;
    panTo: ReturnType<typeof vi.fn>;
    setView: ReturnType<typeof vi.fn>;
    zoomIn: ReturnType<typeof vi.fn>;
    zoomOut: ReturnType<typeof vi.fn>;
  }>;
  Map: ReturnType<typeof vi.fn>;
  reset: () => void;
  tileLayer: ReturnType<typeof vi.fn>;
  tileLayers: Array<{
    emitError: () => void;
    options: Record<string, unknown>;
    urlTemplate: string;
  }>;
}

declare global {
  var __gcsLeafletMock: LeafletTestMock;
}

function leafletMock(): LeafletTestMock {
  return globalThis.__gcsLeafletMock;
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
  leafletMock().reset();
  vi.unstubAllGlobals();
});

describe("TacticalLeafletMap", () => {
  test("renders the public satellite provider by default and fixes stream pins to GPS coordinates", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(screen.getByTestId("public-tactical-map")).toBeInTheDocument();
    expect(leafletMock().Map).toHaveBeenCalledWith(expect.any(HTMLElement), {
      attributionControl: false,
      zoomControl: false,
    });
    expect(leafletMock().instances[0].setView).toHaveBeenCalledWith([35.871435, 128.601445], 14, { animate: false });
    expect(leafletMock().tileLayer).toHaveBeenCalledWith(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      expect.objectContaining({
        attribution: "Esri World Imagery",
        tileSize: 256,
      }),
    );
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    expect(screen.getByRole("button", { name: /로컬 웹캠 위치/ })).toBeInTheDocument();
    expect(leafletMock().instances[0].latLngToContainerPoint).toHaveBeenCalledWith([35.871435, 128.601445]);
    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
  });

  test("opens a compact device popup when a public stream pin is clicked", () => {
    const onSelectStream = vi.fn();
    render(<TacticalLeafletMap onSelectStream={onSelectStream} selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));

    expect(onSelectStream).toHaveBeenCalledWith("raw.local.webcam");
    expect(screen.getByLabelText("로컬 웹캠 단말 정보")).toBeInTheDocument();
    expect(screen.getByText("단말 ID")).toBeInTheDocument();
    expect(screen.getByText("미등록")).toBeInTheDocument();
    expect(screen.getByText("raw.local.webcam")).toBeInTheDocument();
    expect(screen.getByText("35.871435, 128.601445")).toBeInTheDocument();
    expect(screen.getByText("24deg / 64deg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지도 정보 닫기" }));

    expect(screen.queryByLabelText("로컬 웹캠 단말 정보")).not.toBeInTheDocument();
  });

  test("copies popup coordinates to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));
    fireEvent.click(screen.getByRole("button", { name: "좌표 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("35.871435, 128.601445"));
    expect(screen.getByRole("status")).toHaveTextContent("복사됨");
  });

  test("keeps zoom controls bound to the public vector map renderer", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(leafletMock().instances[0].zoomIn).toHaveBeenCalledTimes(1);
    expect(leafletMock().instances[0].zoomOut).toHaveBeenCalledTimes(1);
    expect(leafletMock().instances[0].panTo).toHaveBeenCalled();
  });

  test("disables public map pan animation when motion is off", () => {
    render(<TacticalLeafletMap isMotionEnabled={false} selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(leafletMock().instances[0].panTo).toHaveBeenLastCalledWith([35.871435, 128.601445], {
      animate: false,
      duration: 0,
    });
  });

  test("disables auto focus on direct map interaction and restores selected stream focus from the auto button", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      leafletMock().instances[0].emit("dragstart");
    });

    expect(screen.getByRole("button", { name: "자동 포커스 켜기" })).not.toHaveClass("is-active");

    fireEvent.click(screen.getByRole("button", { name: "자동 포커스 켜기" }));

    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
    expect(leafletMock().instances[0].panTo).toHaveBeenLastCalledWith([35.871435, 128.601445], {
      animate: true,
      duration: 0.28,
    });
  });

  test("focuses the selected stream GPS while auto focus is enabled", () => {
    const { rerender } = render(<TacticalLeafletMap selectedStream={stream} streams={[stream, remoteStream]} />);

    rerender(<TacticalLeafletMap selectedStream={remoteStream} streams={[stream, remoteStream]} />);

    expect(leafletMock().instances[0].panTo).toHaveBeenLastCalledWith([35.8842, 128.6211], {
      animate: true,
      duration: 0.28,
    });
  });

  test("falls back to the closed-network offline renderer when public map loading fails", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      leafletMock().tileLayers[0].emitError();
    });

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("공개 지도 연결 실패로 오프라인 지도로 전환됨");
  });

  test("opens the same device popup from the closed-network offline map pins", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    act(() => {
      leafletMock().tileLayers[0].emitError();
    });
    fireEvent.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));

    const popup = screen.getByLabelText("로컬 웹캠 단말 정보");
    expect(popup).toBeInTheDocument();
    expect(within(popup).getByText("상태")).toBeInTheDocument();
    expect(within(popup).getByText("정상")).toBeInTheDocument();
    expect(within(popup).getByText("실시간 GPS")).toBeInTheDocument();
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
      expect(leafletMock().tileLayer).toHaveBeenLastCalledWith(
        "https://maps.example.test/style.json",
        expect.objectContaining({
          attribution: "Example Maps",
          tileSize: 256,
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
