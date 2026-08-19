import type { StreamDeviceGeometry, StreamDeviceOption } from "@dashboard/assets/streamDeviceContracts";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  type DashboardStreamSlot,
} from "@dashboard/streaming/streamTypes";

const STREAM_DEVICE_FIELDS = ["id", "name", "mediaType", "status", "streamPath"] as const;
const STREAM_SLOT_FIELDS = [
  "id", "title", "status", "mode", "detail", "connectedDeviceId", "streamPath", "aiModeEnabled",
] as const;
const GEOMETRY_FIELDS = [
  "lat", "lng", "altitudeM", "batteryPercent", "headingDeg", "pitchDeg", "rollDeg", "yawDeg", "fovDeg", "source",
] as const;

export function ensureEditableCctvSlot(streams: DashboardStreamSlot[], streamId: string): DashboardStreamSlot[] {
  if (streams.some((stream) => stream.id === streamId)) return streams;
  if (!streamId.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return streams;
  const channelNumber = Number(streamId.replace(CCTV_EMPTY_STREAM_ID_PREFIX, ""));
  if (!Number.isInteger(channelNumber) || channelNumber < 1) return streams;
  return [...streams, createEmptyCctvStreamSlot(channelNumber)];
}

export function areStreamDevicesEqual(previous: StreamDeviceOption[], next: StreamDeviceOption[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((device, index) => isSameStreamDevice(device, next[index]));
}

export function areStreamSlotsEqual(previous: DashboardStreamSlot[], next: DashboardStreamSlot[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((stream, index) => isSameStreamSlot(stream, next[index]));
}

function isSameStreamDevice(device: StreamDeviceOption, nextDevice: StreamDeviceOption): boolean {
  return haveEqualFields(device, nextDevice, STREAM_DEVICE_FIELDS) &&
    isSameGeometry(device.geometry, nextDevice.geometry);
}

function isSameStreamSlot(stream: DashboardStreamSlot, nextStream: DashboardStreamSlot): boolean {
  return haveEqualFields(stream, nextStream, STREAM_SLOT_FIELDS) &&
    isSameGeometry(stream.geometry, nextStream.geometry);
}

function haveEqualFields<T>(left: T, right: T, fields: readonly (keyof T)[]): boolean {
  return fields.every((field) => left[field] === right[field]);
}

function isSameGeometry(
  geometry: StreamDeviceGeometry | null | undefined,
  nextGeometry: StreamDeviceGeometry | null | undefined,
): boolean {
  if (geometry === nextGeometry) return true;
  if (!geometry || !nextGeometry) return false;
  return haveEqualFields(geometry, nextGeometry, GEOMETRY_FIELDS);
}
