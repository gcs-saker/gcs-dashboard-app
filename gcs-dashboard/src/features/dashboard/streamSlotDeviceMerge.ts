import type { StreamDeviceOption } from "./streamDeviceContracts";
import { modeForMediaType, shouldPreferDeviceGeometry } from "./streamDeviceMapping";
import type { DashboardStreamSlot } from "./streamTypes";

export function mergeStreamSlotsWithDevices(
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): DashboardStreamSlot[] {
  const devicesByStreamPath = indexDevicesByStreamPath(devices);
  const seenStreamPaths = new Set<string>();
  const nextStreams = streams.flatMap((stream) => mergeExistingStreamSlot(stream, devicesByStreamPath, seenStreamPaths));
  return compactActiveStreams(placeDiscoveredDevices(nextStreams, devices, devicesByStreamPath), devicesByStreamPath);
}

function compactActiveStreams(
  streams: DashboardStreamSlot[],
  devicesByStreamPath: Map<string, StreamDeviceOption>,
): DashboardStreamSlot[] {
  const active = streams.filter((stream) => stream.streamPath && devicesByStreamPath.has(stream.streamPath));
  const inactive = streams.filter((stream) => !stream.streamPath || !devicesByStreamPath.has(stream.streamPath));
  const ordered = [...active, ...inactive];
  return ordered.map((stream, index) => ({ ...stream, title: streams[index]?.title ?? stream.title }));
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
    geometry: shouldPreferDeviceGeometry(device.geometry) ? device.geometry : stream.geometry ?? device.geometry,
  }];
}

function placeDiscoveredDevices(
  existingStreams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
  devicesByStreamPath: Map<string, StreamDeviceOption>,
): DashboardStreamSlot[] {
  const knownStreamPaths = new Set(existingStreams.flatMap((stream) => stream.streamPath ? [stream.streamPath] : []));
  const discoveredDevices = devices.filter((device) => !knownStreamPaths.has(device.streamPath));
  const nextStreams = [...existingStreams];

  for (const device of discoveredDevices) {
    const emptyIndex = nextStreams.findIndex((stream) => isAvailableSlot(stream, devicesByStreamPath));
    if (emptyIndex >= 0) {
      nextStreams[emptyIndex] = streamSlotForDevice(device, nextStreams[emptyIndex].title);
    } else {
      nextStreams.push(streamSlotForDevice(device, `스트리밍 ${nextStreams.length + 1}`));
    }
  }
  return nextStreams;
}

function isAvailableSlot(
  stream: DashboardStreamSlot,
  devicesByStreamPath: Map<string, StreamDeviceOption>,
): boolean {
  return stream.status === "offline" && (!stream.streamPath || !devicesByStreamPath.has(stream.streamPath));
}

function streamSlotForDevice(device: StreamDeviceOption, title: string): DashboardStreamSlot {
  return {
    id: device.streamPath,
    title,
    status: device.status,
    mode: modeForMediaType(device.mediaType),
    detail: `${device.name} / ${device.streamPath}`,
    connectedDeviceId: device.id,
    streamPath: device.streamPath,
    geometry: device.geometry,
  };
}
