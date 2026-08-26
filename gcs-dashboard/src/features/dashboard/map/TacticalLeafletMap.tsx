import { useCallback, useEffect, useState } from "react";
import { FALLBACK_MAP_CONFIG } from "@/config";
import type { DashboardMapConfig } from "@/config";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { OfflineTacticalMap } from "./OfflineTacticalMap";
import { PublicVectorMap } from "./PublicVectorMap";
import { fetchMapConfig } from "./mapConfig";
import { chooseDashboardMapEngine } from "./mapEngineDecision";
import { type MapLayerMode } from "./MapLayerSelector";

const SATELLITE_MAP_CONFIG: DashboardMapConfig = {
  provider: "esri-satellite",
  styleUrl: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  attribution: "Esri World Imagery",
  requiresApiKey: false,
};
const STREET_MAP_CONFIG: DashboardMapConfig = {
  provider: "custom",
  styleUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: "© OpenStreetMap contributors",
  requiresApiKey: false,
};

interface TacticalLeafletMapProps {
  isMotionEnabled?: boolean;
  onSelectStream?: (streamId: string) => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

export function TacticalLeafletMap({
  isMotionEnabled = true,
  onSelectStream,
  selectedStream,
  streams,
}: TacticalLeafletMapProps) {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.tacticalLeafletMap);
  const map = useTacticalMapState(onSelectStream);

  if (!map.useOfflineMap) {
    return (
      <PublicVectorMap activeStreamId={map.activeStreamId} autoFocusEnabled={map.autoFocusEnabled}
        isMotionEnabled={isMotionEnabled} layerMode={map.layerMode} mapConfig={map.mapConfig}
        onLayerModeChange={map.setLayerMode} onAutoFocusChange={map.setAutoFocusEnabled}
        onStreamMarkerSelect={map.handleStreamMarkerSelect} onStreamPopupClose={map.handlePopupClose}
        selectedStream={selectedStream} streams={streams} onMapError={map.handleMapError} />
    );
  }
  return (
    <OfflineTacticalMap autoFocusEnabled={map.autoFocusEnabled} onAutoFocusChange={map.setAutoFocusEnabled}
      activeStreamId={map.activeStreamId} onStreamMarkerSelect={map.handleStreamMarkerSelect}
      onStreamPopupClose={map.handlePopupClose} fallbackNotice={map.mapFallbackNotice}
      selectedStream={selectedStream} streams={streams} />
  );
}

function useTacticalMapState(onSelectStream?: (streamId: string) => void) {
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(true);
  const [mapConfig, setMapConfig] = useState<DashboardMapConfig>(FALLBACK_MAP_CONFIG);
  const [layerMode, setLayerMode] = useState<MapLayerMode>("satellite");
  const [mapFallbackNotice, setMapFallbackNotice] = useState<string | null>(null);
  const [useOfflineMap, setUseOfflineMap] = useState(chooseDashboardMapEngine(FALLBACK_MAP_CONFIG) === "leaflet-offline");
  const handleMapError = useCallback(() => {
    setMapFallbackNotice("공개 지도 연결 실패로 오프라인 지도로 전환됨");
    setUseOfflineMap(true);
  }, []);
  const handlePopupClose = useCallback(() => setActiveStreamId(null), []);
  const handleStreamMarkerSelect = useCallback((streamId: string): void => {
    setActiveStreamId(streamId);
    onSelectStream?.(streamId);
  }, [onSelectStream]);

  useEffect(() => {
    let disposed = false;
    void fetchMapConfig().then((config) => {
      if (disposed) return;
      setMapConfig(config.provider === "offline" ? config : layerMode === "satellite" ? SATELLITE_MAP_CONFIG : STREET_MAP_CONFIG);
      setUseOfflineMap(chooseDashboardMapEngine(config) === "leaflet-offline");
      setMapFallbackNotice(config.provider === "offline" ? "폐쇄망 오프라인 지도 사용 중" : null);
    });
    return () => {
      disposed = true;
    };
  }, [layerMode]);

  return { activeStreamId, autoFocusEnabled, handleMapError, handlePopupClose, handleStreamMarkerSelect,
    layerMode, mapConfig, mapFallbackNotice, setAutoFocusEnabled, setLayerMode, useOfflineMap } as const;
}
