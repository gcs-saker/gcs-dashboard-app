export {
  fetchStreamDeviceOptions,
  fetchTelemetryHistory,
  fetchTelemetryIndex,
} from "@dashboard/assets/streamDeviceApi";
export {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  preferredSelectedStreamId,
} from "@dashboard/assets/streamDeviceSlot";
export {
  MOCK_STREAM_DEVICES,
  type StreamDeviceGeometry,
  type StreamDeviceOption,
  type StreamRegistryResponse,
  type TelemetryHistoryResponse,
  type TelemetryReadResponse,
} from "@dashboard/assets/streamDeviceContracts";
export { mergeStreamSlotsWithDevices } from "@dashboard/streaming/streamSlotDeviceMerge";
export { buildTelemetryHistoryPath } from "@dashboard/streaming/telemetryContracts";
