import type { StreamDeviceOption } from "./streamDeviceContracts";
import {
  modeForMediaType,
  shouldPreferDeviceGeometry,
} from "./streamDeviceMapping";
import type { DashboardStreamSlot } from "./streamTypes";

export function mergeStreamSlotsWithDevices(
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): DashboardStreamSlot[] {
  const devicesByStreamPath = indexDevicesByStreamPath(devices);
  const seenStreamPaths = new Set<string>();
  const nextStreams = streams.flatMap((stream) => mergeExistingStreamSlot(stream, devicesByStreamPath, seenStreamPaths));
  return [...nextStreams, ...discoverStreamSlots(nextStreams, devices)];
}

function indexDevicesByStreamPath(devices: StreamDeviceOption[]): Map<string, StreamDeviceOption> {
  const devicesByStreamPath = new Map<string, StreamDeviceOption>();
  for (const device of devices) {
    if (!devicesByStreamPath.has(device.streamPath)) devicesByStreamPath.set(device.streamPath, device);
  }
  return devicesByStreamPath;
}

function mergeExistingStreamSlot(
  stream: DashboardStreamSlot,
  devicesByStreamPath: Map<string, StreamDeviceOption>,
  seenStreamPaths: Set<string>,
): DashboardStreamSlot[] {
  if (stream.streamPath) {
    if (seenStreamPaths.has(stream.streamPath)) return [];
    seenStreamPaths.add(stream.streamPath);
  }
  if (!stream.streamPath) return [stream];
  const device = devicesByStreamPath.get(stream.streamPath);
  if (!device) return [{ ...stream, status: "offline" as const }];
  return [{
    ...stream,
    connectedDeviceId: stream.connectedDeviceId ?? device.id,
    detail: `${device.name} / ${device.streamPath}`,
    mode: modeForMediaType(device.mediaType),
    status: device.status,
    geometry: shouldPreferDeviceGeometry(device.geometry) ? device.geometry : null,
  }];
}

function discoverStreamSlots(
  existingStreams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): DashboardStreamSlot[] {
  const knownStreamPaths = new Set(existingStreams.flatMap((stream) => stream.streamPath ? [stream.streamPath] : []));
  return devices
    .filter((device) => !knownStreamPaths.has(device.streamPath))
    .map((device, index): DashboardStreamSlot => ({
      id: device.id,
      title: `스트리밍 ${existingStreams.length + index + 1}`,
      status: device.status,
      mode: modeForMediaType(device.mediaType),
      detail: `${device.name} / ${device.streamPath}`,
      connectedDeviceId: device.id,
      streamPath: device.streamPath,
      geometry: device.geometry,
    }));
}
