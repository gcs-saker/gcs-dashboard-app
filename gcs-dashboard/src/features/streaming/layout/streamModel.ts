import type {
  DashboardGeometrySource,
  DashboardStreamMode,
  DashboardStreamStatus,
} from "@/features/stateContracts";

export interface StreamGeometry {
  lat: number;
  lng: number;
  altitudeM: number;
  batteryPercent?: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  fovDeg: number;
  source?: DashboardGeometrySource;
}

export interface StreamSlot {
  id: string;
  title: string;
  status: DashboardStreamStatus;
  mode: DashboardStreamMode;
  detail: string;
  aiModeEnabled?: boolean;
  connectedDeviceId?: string | null;
  streamPath?: string | null;
  geometry?: StreamGeometry | null;
}
