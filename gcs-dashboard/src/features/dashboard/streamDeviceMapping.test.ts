import { describe, expect, test } from "vitest";
import {
  dashboardStatusFromRegistryStatus,
  defaultGeometryForStream,
  mediaTypeFromStreamPath,
  modeForMediaType,
  streamDeviceFromRegistryItem,
} from "./streamDeviceMapping";

describe("streamDeviceMapping", () => {
  test("maps device media types to dashboard modes", () => {
    expect(modeForMediaType("eo")).toBe("EO");
    expect(modeForMediaType("ir")).toBe("IR");
    expect(modeForMediaType("ai")).toBe("AI");
    expect(modeForMediaType("map")).toBe("MAP");
  });

  test("normalizes registry status for dashboard state", () => {
    expect(dashboardStatusFromRegistryStatus("online")).toBe("online");
    expect(dashboardStatusFromRegistryStatus("offline")).toBe("offline");
    expect(dashboardStatusFromRegistryStatus("registered")).toBe("degraded");
    expect(dashboardStatusFromRegistryStatus("unknown")).toBe("degraded");
  });

  test("builds registry devices with telemetry geometry when available", () => {
    const device = streamDeviceFromRegistryItem(
      {
        streamId: "raw.drone-07.front",
        path: "raw/drone-07/front",
        prefix: "raw",
        assetId: "drone-07",
        sensorId: "front",
        status: "online",
        displayName: "Drone 07 Front",
      },
      new Map([
        [
          "raw.drone-07.front",
          {
            uuid: "raw.drone-07.front",
            latitude: 35.8842,
            longitude: 128.6123,
            altitude: 81,
            velocity: 3,
            epochTime: "00:00:10",
            headingDeg: 127,
            batteryPercent: 78,
            pitchDeg: -2,
            rollDeg: 3,
            yawDeg: 126,
          },
        ],
      ]),
    );

    expect(device).toMatchObject({
      id: "registry-raw.drone-07.front",
      status: "online",
      mediaType: "eo",
      geometry: {
        lat: 35.8842,
        lng: 128.6123,
        batteryPercent: 78,
        headingDeg: 127,
        pitchDeg: -2,
        rollDeg: 3,
        yawDeg: 126,
        source: "telemetry",
      },
    });
  });

  test("uses device UUID telemetry through the registry asset ID", () => {
    const deviceUuid = "61519988-afea-4096-a10a-816569a8dfd2";
    const device = streamDeviceFromRegistryItem(
      {
        streamId: "raw.uav01.front",
        path: "raw/uav01/front",
        prefix: "raw",
        assetId: deviceUuid,
        sensorId: "front",
        status: "online",
      },
      new Map([
        [
          deviceUuid,
          {
            uuid: deviceUuid,
            latitude: 36.1195,
            longitude: 128.3446,
            altitude: 50,
            velocity: 0,
            epochTime: "00:00:10",
          },
        ],
      ]),
    );

    expect(device.geometry).toMatchObject({
      lat: 36.1195,
      lng: 128.3446,
      altitudeM: 50,
      source: "telemetry",
    });
  });

  test("keeps fallback geometry in the Daegu operating area", () => {
    expect(mediaTypeFromStreamPath("ai.drn-01.front.detector")).toBe("ai");
    expect(mediaTypeFromStreamPath("raw.drn-01.thermal")).toBe("ir");
    expect(defaultGeometryForStream("raw.unknown.front")).toMatchObject({
      lat: 35.871435,
      lng: 128.601445,
      source: "mock",
    });
  });
});
