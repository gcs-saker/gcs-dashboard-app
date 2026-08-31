import { describe, expect, it } from "vitest";

import { buildPublisherGpsTelemetryPayload } from "./publisherGpsTelemetry";

function geolocationPosition(
  coords: Partial<GeolocationCoordinates> & Pick<GeolocationCoordinates, "latitude" | "longitude">,
): GeolocationPosition {
  return {
    coords: {
      accuracy: coords.accuracy ?? 3,
      altitude: coords.altitude ?? null,
      altitudeAccuracy: coords.altitudeAccuracy ?? null,
      heading: coords.heading ?? null,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed: coords.speed ?? null,
      toJSON: () => ({}),
    },
    timestamp: 1_720_000_000,
    toJSON: () => ({}),
  };
}

describe("publisherGpsTelemetry", () => {
  it("maps browser geolocation into telemetry DTO fields", () => {
    const payload = buildPublisherGpsTelemetryPayload(
      geolocationPosition({
        altitude: 23.5,
        latitude: 35.8714,
        longitude: 128.6014,
        speed: 7.2,
      }),
      "raw.local.front",
      12,
      1_720_000_000_000,
    );

    expect(payload).toEqual({
      uuid: "raw.local.front",
      latitude: 35.8714,
      longitude: 128.6014,
      altitude: 23.5,
      velocity: 7.2,
      epochTime: 12,
      observedUnixMillis: 1_720_000_000_000,
    });
  });

  it("uses zero defaults for nullable optional geolocation metrics", () => {
    const payload = buildPublisherGpsTelemetryPayload(
      geolocationPosition({
        latitude: 35.8714,
        longitude: 128.6014,
      }),
      "raw.local.rear",
      0,
    );

    expect(payload.altitude).toBe(0);
    expect(payload.velocity).toBe(0);
  });
});
