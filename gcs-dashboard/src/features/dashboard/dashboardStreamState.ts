import type { StreamDeviceOption } from "./streamDeviceContracts";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  type DashboardStreamSlot,
} from "./streamTypes";

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
  return (
    device.id === nextDevice.id &&
    device.name === nextDevice.name &&
    device.mediaType === nextDevice.mediaType &&
    device.status === nextDevice.status &&
    device.streamPath === nextDevice.streamPath &&
    device.geometry.lat === nextDevice.geometry.lat &&
    device.geometry.lng === nextDevice.geometry.lng &&
    device.geometry.altitudeM === nextDevice.geometry.altitudeM &&
    device.geometry.batteryPercent === nextDevice.geometry.batteryPercent &&
    device.geometry.headingDeg === nextDevice.geometry.headingDeg &&
    device.geometry.pitchDeg === nextDevice.geometry.pitchDeg &&
    device.geometry.rollDeg === nextDevice.geometry.rollDeg &&
    device.geometry.speedMps === nextDevice.geometry.speedMps &&
    device.geometry.yawDeg === nextDevice.geometry.yawDeg &&
    device.geometry.fovDeg === nextDevice.geometry.fovDeg &&
    device.geometry.source === nextDevice.geometry.source
  );
}

function isSameStreamSlot(stream: DashboardStreamSlot, nextStream: DashboardStreamSlot): boolean {
  return (
    stream.id === nextStream.id &&
    stream.title === nextStream.title &&
    stream.status === nextStream.status &&
    stream.mode === nextStream.mode &&
    stream.detail === nextStream.detail &&
    stream.connectedDeviceId === nextStream.connectedDeviceId &&
    stream.streamPath === nextStream.streamPath &&
    stream.aiModeEnabled === nextStream.aiModeEnabled &&
    stream.geometry?.lat === nextStream.geometry?.lat &&
    stream.geometry?.lng === nextStream.geometry?.lng &&
    stream.geometry?.altitudeM === nextStream.geometry?.altitudeM &&
    stream.geometry?.batteryPercent === nextStream.geometry?.batteryPercent &&
    stream.geometry?.headingDeg === nextStream.geometry?.headingDeg &&
    stream.geometry?.pitchDeg === nextStream.geometry?.pitchDeg &&
    stream.geometry?.rollDeg === nextStream.geometry?.rollDeg &&
    stream.geometry?.speedMps === nextStream.geometry?.speedMps &&
    stream.geometry?.yawDeg === nextStream.geometry?.yawDeg &&
    stream.geometry?.fovDeg === nextStream.geometry?.fovDeg &&
    stream.geometry?.source === nextStream.geometry?.source
  );
}
