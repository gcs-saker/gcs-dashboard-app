import { LOCAL_WEBCAM_STREAM_ID } from "@/config";
import { normalizeStreamAddress } from "./streamAddress";
import type { StreamDeviceOption } from "./streamDeviceContracts";
import {
  defaultGeometryForStream,
  mediaTypeFromStreamPath,
  modeForMediaType,
} from "./streamDeviceMapping";
import type { DashboardStreamSlot } from "./streamTypes";

export function connectDeviceToStreamSlot(
  stream: DashboardStreamSlot,
  device: StreamDeviceOption,
): DashboardStreamSlot {
  return {
    ...stream,
    connectedDeviceId: device.id,
    detail: `${device.name} / ${device.streamPath}`,
    mode: modeForMediaType(device.mediaType),
    status: device.status,
    streamPath: device.streamPath,
    sourceUrl: device.sourceUrl ?? null,
    geometry: device.geometry,
  };
}

export function disconnectStreamSlot(stream: DashboardStreamSlot): DashboardStreamSlot {
  return {
    ...stream,
    connectedDeviceId: null,
    detail: "장비 미연결",
    status: "offline",
    streamPath: null,
    sourceUrl: null,
    geometry: null,
  };
}

export function createManualStreamDeviceOption(
  address: string,
  displayName: string,
  fallbackTitle: string,
): StreamDeviceOption {
  const streamPath = normalizeStreamAddress(address);
  return {
    id: `manual-${streamPath}`,
    name: displayName.trim() || fallbackTitle || streamPath,
    streamPath,
    sourceUrl: address.trim(),
    status: "degraded",
    mediaType: mediaTypeFromStreamPath(streamPath),
    geometry: defaultGeometryForStream(streamPath, "device"),
  };
}

export function preferredSelectedStreamId(
  currentStreamId: string,
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): string {
  if (devices.length === 0) return currentStreamId;
  const currentStream = streams.find((stream) => stream.id === currentStreamId);
  const currentDevice = devices.find((device) => device.streamPath === currentStream?.streamPath);
  if (currentDevice?.status === "online") return currentStreamId;

  const preferredDevice =
    devices.find((device) => device.streamPath === LOCAL_WEBCAM_STREAM_ID && device.status === "online") ??
    devices.find((device) => device.status === "online") ??
    devices.find((device) => device.streamPath === LOCAL_WEBCAM_STREAM_ID) ??
    devices[0];

  return streams.find((stream) => stream.streamPath === preferredDevice.streamPath)?.id ?? preferredDevice.streamPath;
}
