export {
  fetchStreamDeviceOptions,
  fetchTelemetryHistory,
  fetchTelemetryIndex,
} from "./streamDeviceApi";
import {
  createManualStreamDeviceOption as createManualStreamDeviceOptionFromSlot,
} from "./streamDeviceSlot";
import {
  normalizeStreamAddress as normalizeStreamAddressValue,
} from "./streamAddress";
export {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  preferredSelectedStreamId,
} from "./streamDeviceSlot";
export {
  MOCK_STREAM_DEVICES,
  type StreamDeviceGeometry,
  type StreamDeviceOption,
  type StreamRegistryResponse,
  type TelemetryHistoryResponse,
  type TelemetryReadResponse,
} from "./streamDeviceContracts";
export { mergeStreamSlotsWithDevices } from "./streamSlotDeviceMerge";
export { buildTelemetryHistoryPath } from "./telemetryContracts";

export function createManualStreamDeviceOption(address: string, displayName: string, fallbackTitle: string) {
  // Contract: manual addresses stay status: "degraded" until server or playback validation confirms them.
  return createManualStreamDeviceOptionFromSlot(address, displayName, fallbackTitle);
}

export function normalizeStreamAddress(address: string): string {
  return normalizeStreamAddressValue(address);
}
