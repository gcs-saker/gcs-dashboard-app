import type { DashboardMapConfig } from "@/config";

export type DashboardMapEngine = "leaflet-public" | "leaflet-offline";
export type MapEngineCandidate = DashboardMapEngine | "maplibre-reintroduction-candidate";

export interface MapEngineRequirements {
  needsOfflineTiles: boolean;
  needsVectorStyleEditing: boolean;
  expectedMarkerCount: number;
  requiresSatelliteTiles: boolean;
}

export interface MapEngineDecision {
  engine: MapEngineCandidate;
  reason: string;
}

const MAPLIBRE_MARKER_THRESHOLD = 1_000;

export function chooseDashboardMapEngine(config: DashboardMapConfig): DashboardMapEngine {
  return config.provider === "offline" ? "leaflet-offline" : "leaflet-public";
}

export function evaluateMapEngineRequirements(requirements: MapEngineRequirements): MapEngineDecision {
  if (requirements.needsOfflineTiles) {
    return {
      engine: "leaflet-offline",
      reason: "폐쇄망 오프라인 타일은 현재 Leaflet fallback renderer가 가장 작은 런타임으로 처리합니다.",
    };
  }
  if (requirements.needsVectorStyleEditing || requirements.expectedMarkerCount >= MAPLIBRE_MARKER_THRESHOLD) {
    return {
      engine: "maplibre-reintroduction-candidate",
      reason: "벡터 스타일 편집 또는 대량 마커가 필요해지면 WebGL 기반 MapLibre 재도입을 검토합니다.",
    };
  }
  return {
    engine: "leaflet-public",
    reason: requirements.requiresSatelliteTiles
      ? "공개망 위성 타일과 소수 실시간 GPS 핀은 Leaflet 타일 레이어가 단순하고 안정적입니다."
      : "현재 전술 지도 요구는 Leaflet의 imperative marker/focus 제어로 충분합니다.",
  };
}
