import { useCallback, useEffect, useState } from "react";
import { FALLBACK_MAP_CONFIG } from "@/config";
import type { DashboardMapConfig } from "@/config";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { OfflineTacticalMap } from "./OfflineTacticalMap";
import { PublicVectorMap } from "./PublicVectorMap";
import { fetchMapConfig } from "./mapConfig";
import { chooseDashboardMapEngine } from "./mapEngineDecision";

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
        isMotionEnabled={isMotionEnabled} mapConfig={map.mapConfig} onAutoFocusChange={map.setAutoFocusEnabled}
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
      setMapConfig(config);
      setUseOfflineMap(chooseDashboardMapEngine(config) === "leaflet-offline");
      setMapFallbackNotice(config.provider === "offline" ? "폐쇄망 오프라인 지도 사용 중" : null);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return { activeStreamId, autoFocusEnabled, handleMapError, handlePopupClose, handleStreamMarkerSelect,
    mapConfig, mapFallbackNotice, setAutoFocusEnabled, useOfflineMap } as const;
}
