import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

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

describe("TacticalLeafletMap", () => {
  test("renders a closed-network map without external tile providers", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    expect(screen.getByRole("button", { name: /로컬 웹캠 위치/ })).toBeInTheDocument();
  });

  test("keeps zoom controls local to the offline renderer", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
  });
});
