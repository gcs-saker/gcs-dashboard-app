import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

const popupContents: unknown[] = [];
const mapSetView = vi.fn();
const markerLayer = {
  addTo: vi.fn(function addTo() {
    return markerLayer;
  }),
  clearLayers: vi.fn(),
  remove: vi.fn(),
};

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      getZoom: vi.fn(() => 14),
      remove: vi.fn(),
      setView: mapSetView,
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({
      addTo: vi.fn(),
    })),
    layerGroup: vi.fn(() => markerLayer),
    circleMarker: vi.fn(() => {
      const marker = {
        bindPopup: vi.fn((content: unknown) => {
        popupContents.push(content);
          return marker;
        }),
        addTo: vi.fn(),
      };
      return marker;
    }),
  },
}));

describe("TacticalLeafletMap", () => {
  test("binds stream metadata to Leaflet popups as text nodes instead of HTML", () => {
    popupContents.length = 0;
    const stream: DashboardStreamSlot = {
      id: "raw.xss",
      title: '<img src=x onerror="alert(1)">',
      status: "online",
      mode: "EO",
      detail: "xss test",
      streamPath: '<script>alert("path")</script>',
      geometry: {
        lat: 35.871435,
        lng: 128.601445,
        altitudeM: 10,
        headingDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        yawDeg: 0,
        fovDeg: 60,
      },
    };

    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(popupContents).toHaveLength(1);
    const popup = popupContents[0] as HTMLElement;
    expect(popup).toBeInstanceOf(HTMLElement);
    expect(popup.querySelector("img")).toBeNull();
    expect(popup.querySelector("script")).toBeNull();
    expect(popup.querySelector("strong")?.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(popup.textContent).toContain('<script>alert("path")</script>');
    expect(popup.textContent).toContain("기본 좌표");
  });
});
