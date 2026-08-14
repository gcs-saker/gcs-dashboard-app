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

  if (!useOfflineMap) {
    return (
      <PublicVectorMap
        activeStreamId={activeStreamId}
        autoFocusEnabled={autoFocusEnabled}
        isMotionEnabled={isMotionEnabled}
        mapConfig={mapConfig}
        onAutoFocusChange={setAutoFocusEnabled}
        onStreamMarkerSelect={handleStreamMarkerSelect}
        onStreamPopupClose={handlePopupClose}
        selectedStream={selectedStream}
        streams={streams}
        onMapError={handleMapError}
      />
    );
  }

  return (
    <OfflineTacticalMap
      autoFocusEnabled={autoFocusEnabled}
      onAutoFocusChange={setAutoFocusEnabled}
      activeStreamId={activeStreamId}
      onStreamMarkerSelect={handleStreamMarkerSelect}
      onStreamPopupClose={handlePopupClose}
      fallbackNotice={mapFallbackNotice}
      selectedStream={selectedStream}
      streams={streams}
    />
  );
}
