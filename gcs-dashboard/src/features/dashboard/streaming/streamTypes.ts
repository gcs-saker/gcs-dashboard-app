import type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus } from "@/features/stateContracts";
import type { StreamGeometry, StreamSlot } from "@streaming/layout/streamModel";

export type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus };
export type DashboardStreamGeometry = StreamGeometry;
export type DashboardStreamSlot = StreamSlot;

export {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  DEFAULT_DASHBOARD_STREAMS,
} from "@dashboard/streaming/dashboardDefaultStreams";
export * from "@dashboard/streaming/streamPresentation";
export * from "@dashboard/streaming/streamWidgetDefinition";
