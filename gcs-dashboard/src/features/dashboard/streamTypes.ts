import type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus } from "@/features/stateContracts";
import type { StreamGeometry, StreamSlot } from "@streaming/streamModel";

export type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus };
export type DashboardStreamGeometry = StreamGeometry;
export type DashboardStreamSlot = StreamSlot;

export {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  DEFAULT_DASHBOARD_STREAMS,
} from "./dashboardDefaultStreams";
export * from "./streamPresentation";
export * from "./streamWidgetDefinition";
