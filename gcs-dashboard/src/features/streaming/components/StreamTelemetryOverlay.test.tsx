import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreamTelemetryOverlay } from "./StreamTelemetryOverlay";

describe("StreamTelemetryOverlay", () => {
  it("renders matched stream geometry without exposing stream credentials", () => {
    render(
      <StreamTelemetryOverlay
        geometry={{
          altitudeM: 42.5,
          batteryPercent: 78.5,
          fovDeg: 60,
          headingDeg: 123.4,
          lat: 35.8714,
          lng: 128.6014,
          pitchDeg: -0.4,
          rollDeg: 1.2,
          source: "telemetry",
          yawDeg: 123.4,
        }}
      />,
    );

    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("35.87140");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("128.60140");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("42.5 m");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("123°");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("79%");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("R 1.2° · P -0.4° · Y 123.4°");
  });

  it("does not reserve an overlay when telemetry is unavailable", () => {
    render(<StreamTelemetryOverlay geometry={null} />);
    expect(screen.queryByLabelText("스트림 텔레메트리")).not.toBeInTheDocument();
  });

  it("does not present registry defaults as received telemetry", () => {
    render(
      <StreamTelemetryOverlay
        geometry={{
          altitudeM: 0, fovDeg: 60, headingDeg: 0, lat: 35.8, lng: 128.6,
          pitchDeg: 0, rollDeg: 0, source: "registry", yawDeg: 0,
        }}
      />,
    );
    expect(screen.queryByLabelText("스트림 텔레메트리")).not.toBeInTheDocument();
  });
});
