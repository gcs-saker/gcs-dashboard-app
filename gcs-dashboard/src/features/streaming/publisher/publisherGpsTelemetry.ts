export interface PublisherGpsTelemetryPayload {
  uuid: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epochTime: number;
}

export function buildPublisherGpsTelemetryPayload(
  position: GeolocationPosition,
  streamId: string,
  elapsedSeconds: number,
): PublisherGpsTelemetryPayload {
  return {
    uuid: streamId,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: position.coords.altitude ?? 0,
    velocity: position.coords.speed ?? 0,
    epochTime: elapsedSeconds,
  };
}
