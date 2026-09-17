import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

interface LeafletTestMock {
  instances: Array<{
    emit: (event: string) => void;
    invalidateSize: ReturnType<typeof vi.fn>;
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
    batteryPercent: 78,
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

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        provider: "custom",
        styleUrl: "https://maps.example.test/style.json",
        attribution: "Example Maps",
        requiresApiKey: false,
      }),
    })),
  );
});

describe("TacticalLeafletMap", () => {
  test("renders the server-configured public provider and fixes stream pins to GPS coordinates", async () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(await screen.findByTestId("public-tactical-map")).toBeInTheDocument();
    await waitFor(() => {
      expect(leafletMock().Map).toHaveBeenCalledWith(expect.any(HTMLElement), {
        attributionControl: false,
        zoomControl: false,
      });
    });
    expect(leafletMock().instances[0].setView).toHaveBeenCalledWith([35.871435, 128.601445], 14, { animate: false });
    expect(leafletMock().tileLayer).toHaveBeenCalledWith(
      "https://maps.example.test/style.json",
      expect.objectContaining({
        attribution: "Example Maps",
        tileSize: 256,
      }),
    );
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    const marker = await screen.findByRole("button", { name: /로컬 웹캠 위치/ });
    expect(marker).toBeInTheDocument();
    expect(within(marker).getByText("정상")).toBeInTheDocument();
    expect(within(marker).getByText("78%")).toBeInTheDocument();
    expect(leafletMock().instances[0].latLngToContainerPoint).toHaveBeenCalledWith([35.871435, 128.601445]);
    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
  });

  test("opens a compact device popup when a public stream pin is clicked", () => {
    const onSelectStream = vi.fn();
    render(<TacticalLeafletMap onSelectStream={onSelectStream} selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));

    expect(onSelectStream).toHaveBeenCalledWith("raw.local.webcam");
    expect(screen.getByLabelText("로컬 웹캠 단말 정보")).toBeInTheDocument();
    expect(screen.getByText("연결 상태")).toBeInTheDocument();
    expect(screen.getByText("미등록")).toBeInTheDocument();
    expect(screen.getByText("closed network map test")).toBeInTheDocument();
    expect(screen.queryByText("raw.local.webcam")).not.toBeInTheDocument();
    expect(screen.getByText("35.871435, 128.601445")).toBeInTheDocument();
    expect(screen.getByText("배터리")).toBeInTheDocument();
    expect(screen.getAllByText("78%").length).toBeGreaterThan(0);
    expect(screen.getByText("24deg / 64deg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지도 정보 닫기" }));

    expect(screen.queryByLabelText("로컬 웹캠 단말 정보")).not.toBeInTheDocument();
  });

  test("copies popup coordinates to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");
    await screen.findByRole("button", { name: /로컬 웹캠 위치/ });

    fireEvent.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));
    fireEvent.click(screen.getByRole("button", { name: "좌표 복사" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("35.871435, 128.601445"));
    expect(screen.getByText("복사됨", { selector: "[role='status']" })).toBeInTheDocument();
  });

  test("keeps zoom controls bound to the public vector map renderer", async () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");
    await waitFor(() => expect(leafletMock().instances.length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(leafletMock().instances.at(-1)?.zoomIn).toHaveBeenCalledTimes(1);
    expect(leafletMock().instances.at(-1)?.zoomOut).toHaveBeenCalledTimes(1);
    expect(leafletMock().instances.at(-1)?.panTo).toHaveBeenCalled();
  });

  test("resizes the public map when its dashboard panel changes size", async () => {
    let notifyResize: ResizeObserverCallback | undefined;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }

      disconnect = disconnect;
      observe = observe;
      unobserve = vi.fn();
    });

    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");

    await act(async () => Promise.resolve());
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ className: "tactical-map__leaflet" }));
    act(() => notifyResize?.([], {} as ResizeObserver));
    expect(leafletMock().instances.at(-1)?.invalidateSize).toHaveBeenCalledWith(false);
  });

  test("disables public map pan animation when motion is off", async () => {
    render(<TacticalLeafletMap isMotionEnabled={false} selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");

    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(leafletMock().instances[0].panTo).toHaveBeenLastCalledWith([35.871435, 128.601445], {
      animate: false,
      duration: 0,
    });
  });

  test("disables auto focus on direct map interaction and restores selected stream focus from the auto button", async () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");

    act(() => {
      leafletMock().instances.at(-1)?.emit("dragstart");
    });

    expect(screen.getByRole("button", { name: "자동 포커스 켜기" })).not.toHaveClass("is-active");

    fireEvent.click(screen.getByRole("button", { name: "자동 포커스 켜기" }));

    expect(screen.getByRole("button", { name: "자동 포커스 켜짐" })).toHaveClass("is-active");
    expect(leafletMock().instances[0].panTo).toHaveBeenLastCalledWith([35.871435, 128.601445], {
      animate: true,
      duration: 0.28,
    });
  });

  test("focuses the selected stream GPS while auto focus is enabled", async () => {
    const { rerender } = render(<TacticalLeafletMap selectedStream={stream} streams={[stream, remoteStream]} />);
    await screen.findByTestId("public-tactical-map");

    rerender(<TacticalLeafletMap selectedStream={remoteStream} streams={[stream, remoteStream]} />);

    expect(leafletMock().instances.at(-1)?.panTo).toHaveBeenLastCalledWith([35.8842, 128.6211], {
      animate: true,
      duration: 0.28,
    });
  });

  test("falls back to the closed-network offline renderer when public map loading fails", async () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");
    await waitFor(() => expect(leafletMock().tileLayers.length).toBeGreaterThan(0));

    act(() => {
      leafletMock().tileLayers.at(-1)?.emitError();
    });

    expect(await screen.findByTestId("offline-tactical-map")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("공개 지도 연결 실패로 오프라인 지도로 전환됨");
  });

  test("opens the same device popup from the closed-network offline map pins", async () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);
    await screen.findByTestId("public-tactical-map");
    await waitFor(() => expect(leafletMock().tileLayers.length).toBeGreaterThan(0));

    act(() => {
      leafletMock().tileLayers.at(-1)?.emitError();
    });
    fireEvent.click(await screen.findByRole("button", { name: /로컬 웹캠 위치/ }));

    const popup = screen.getByLabelText("로컬 웹캠 단말 정보");
    expect(popup).toBeInTheDocument();
    expect(within(popup).getByText("상태")).toBeInTheDocument();
    expect(within(popup).getByText("정상")).toBeInTheDocument();
    expect(within(popup).getByText("실시간 GPS")).toBeInTheDocument();
  });

  test("never replaces the server-configured map URL when layer controls are used", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "평면" }));
    await waitFor(() => expect(leafletMock().tileLayer).toHaveBeenLastCalledWith(
      "https://maps.example.test/style.json",
      expect.objectContaining({ attribution: "Example Maps" }),
    ));
    await waitFor(() => expect(leafletMock().instances.at(-1)?.setView).toHaveBeenCalledWith(
      [35.871435, 128.601445], 12, { animate: false },
    ));
    fireEvent.click(screen.getByRole("button", { name: "위성" }));
  });
});
