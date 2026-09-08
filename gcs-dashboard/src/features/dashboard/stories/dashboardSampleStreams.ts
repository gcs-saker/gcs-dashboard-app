import { MOCK_STREAM_DEVICES } from "@dashboard/assets/streamDeviceContracts";
import { modeForMediaType } from "@dashboard/assets/streamDeviceMapping";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

export const SAMPLE_DASHBOARD_STREAMS: DashboardStreamSlot[] = MOCK_STREAM_DEVICES.map((device, index) => ({
  id: device.streamPath,
  title: `스트리밍 ${index + 1}`,
  status: "offline",
  mode: modeForMediaType(device.mediaType),
  detail: ["전방 EO", "열화상 fallback", "AI 감지 overlay", "로컬 웹캠 대기"][index],
  connectedDeviceId: device.id,
  streamPath: device.streamPath,
  geometry: device.geometry,
}));
