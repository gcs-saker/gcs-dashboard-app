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
          yawDeg: 123.4,
        }}
      />,
    );

    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("35.87140");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("128.60140");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("42.5 m");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("123°");
    expect(screen.getByLabelText("스트림 텔레메트리")).toHaveTextContent("79%");
  });

  it("does not reserve an overlay when telemetry is unavailable", () => {
    render(<StreamTelemetryOverlay geometry={null} />);
    expect(screen.queryByLabelText("스트림 텔레메트리")).not.toBeInTheDocument();
  });
});
