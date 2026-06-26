import { useCallback, useEffect, useMemo, useState } from "react";
import { FALLBACK_MAP_CONFIG } from "@/config";
import type { DashboardMapConfig } from "@/config";
import type { DashboardStreamSlot } from "../streamTypes";
import { PublicVectorMap } from "./PublicVectorMap";
import { fetchMapConfig } from "./mapConfig";
import {
  coordinateSourceLabel,
  coordinateText,
  DEFAULT_MAP_CENTER,
  INITIAL_MAP_ZOOM,
  markerClassForStream,
  projectStreams,
} from "./mapContracts";
import { StreamMapPopup } from "./StreamMapPopup";

interface TacticalLeafletMapProps {
  isMotionEnabled?: boolean;
  onSelectStream?: (streamId: string) => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function TacticalLeafletMap({
  isMotionEnabled = true,
  onSelectStream,
  selectedStream,
  streams,
}: TacticalLeafletMapProps) {
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(true);
  const [mapConfig, setMapConfig] = useState<DashboardMapConfig>(FALLBACK_MAP_CONFIG);
  const [mapFallbackNotice, setMapFallbackNotice] = useState<string | null>(null);
  const [useOfflineMap, setUseOfflineMap] = useState(FALLBACK_MAP_CONFIG.provider === "offline");
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
      setUseOfflineMap(config.provider === "offline");
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
      isMotionEnabled={isMotionEnabled}
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

interface OfflineTacticalMapProps extends TacticalLeafletMapProps {
  activeStreamId: string | null;
  autoFocusEnabled: boolean;
  fallbackNotice: string | null;
  onAutoFocusChange: (enabled: boolean) => void;
  onStreamMarkerSelect: (streamId: string) => void;
  onStreamPopupClose: () => void;
}

function OfflineTacticalMap({
  activeStreamId,
  autoFocusEnabled,
  fallbackNotice,
  onAutoFocusChange,
  onStreamMarkerSelect,
  onStreamPopupClose,
  selectedStream,
  streams,
}: OfflineTacticalMapProps) {
  const [zoom, setZoom] = useState(INITIAL_MAP_ZOOM);
  const projectedStreams = useMemo(() => projectStreams(streams, selectedStream, zoom), [selectedStream, streams, zoom]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
  const activeStream = streams.find((stream) => stream.id === activeStreamId) ?? null;

  return (
    <div
      className="tactical-map__canvas tactical-map__canvas--offline"
      data-testid="offline-tactical-map"
      aria-label="폐쇄망 오프라인 전술 지도"
    >
      <div className="offline-map-grid" aria-hidden="true" />
      <div className="offline-map-roads" aria-hidden="true" />
      <div className="offline-map-river" aria-hidden="true" />
      <span className="map-coordinate-source" data-testid="map-coordinate-source">
        {coordinateSourceLabel(selectedStream)}
      </span>
      {fallbackNotice ? <span className="map-fallback-notice" role="status">{fallbackNotice}</span> : null}
      <span className="offline-map-center" data-testid="offline-map-center">
        중심 {selectedGeometry.lat.toFixed(6)}, {selectedGeometry.lng.toFixed(6)}
      </span>
      {activeStream ? <StreamMapPopup stream={activeStream} onClose={onStreamPopupClose} /> : null}
      <div className="map-toolbar" aria-label="지도 도구">
        <button
          aria-label={autoFocusEnabled ? "자동 포커스 켜짐" : "자동 포커스 켜기"}
          className={autoFocusEnabled ? "is-active" : undefined}
          type="button"
          onClick={() => onAutoFocusChange(true)}
        >
          Auto
        </button>
        <button
          aria-label="지도 중심 초기화"
          type="button"
          onClick={() => {
            onAutoFocusChange(false);
            setZoom(INITIAL_MAP_ZOOM);
          }}
        >
          ⌖
        </button>
        <button
          aria-label="지도 확대"
          type="button"
          onClick={() => {
            onAutoFocusChange(false);
            setZoom((current) => Math.min(MAX_ZOOM, current + 1));
          }}
        >
          +
        </button>
        <button
          aria-label="지도 축소"
          type="button"
          onClick={() => {
            onAutoFocusChange(false);
            setZoom((current) => Math.max(MIN_ZOOM, current - 1));
          }}
        >
          -
        </button>
      </div>
      {projectedStreams.map(({ stream, left, top }) => (
        <button
          key={stream.id}
          className={`${markerClassForStream(stream, selectedStream)} offline-map-marker--pin`}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          title={`${stream.title} / ${coordinateText(stream)}`}
          aria-label={`${stream.title} 위치 ${coordinateText(stream)}`}
          onClick={() => onStreamMarkerSelect(stream.id)}
        >
          <span className="offline-map-marker__dot" />
          <span className="offline-map-marker__label">{stream.title}</span>
        </button>
      ))}
    </div>
  );
}
