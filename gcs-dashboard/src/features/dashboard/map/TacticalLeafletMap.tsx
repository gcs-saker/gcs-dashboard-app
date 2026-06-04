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

interface TacticalLeafletMapProps {
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export function TacticalLeafletMap({ selectedStream, streams }: TacticalLeafletMapProps) {
  const [autoFocusEnabled, setAutoFocusEnabled] = useState(true);
  const [mapConfig, setMapConfig] = useState<DashboardMapConfig>(FALLBACK_MAP_CONFIG);
  const [useOfflineMap, setUseOfflineMap] = useState(FALLBACK_MAP_CONFIG.provider === "offline");
  const handleMapError = useCallback(() => setUseOfflineMap(true), []);

  useEffect(() => {
    let disposed = false;
    void fetchMapConfig().then((config) => {
      if (disposed) return;
      setMapConfig(config);
      setUseOfflineMap(config.provider === "offline");
    });
    return () => {
      disposed = true;
    };
  }, []);

  if (!useOfflineMap) {
    return (
      <PublicVectorMap
        autoFocusEnabled={autoFocusEnabled}
        mapConfig={mapConfig}
        onAutoFocusChange={setAutoFocusEnabled}
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
      selectedStream={selectedStream}
      streams={streams}
    />
  );
}

interface OfflineTacticalMapProps extends TacticalLeafletMapProps {
  autoFocusEnabled: boolean;
  onAutoFocusChange: (enabled: boolean) => void;
}

function OfflineTacticalMap({
  autoFocusEnabled,
  onAutoFocusChange,
  selectedStream,
  streams,
}: OfflineTacticalMapProps) {
  const [zoom, setZoom] = useState(INITIAL_MAP_ZOOM);
  const projectedStreams = useMemo(() => projectStreams(streams, selectedStream, zoom), [selectedStream, streams, zoom]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;

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
      <span className="offline-map-center" data-testid="offline-map-center">
        중심 {selectedGeometry.lat.toFixed(6)}, {selectedGeometry.lng.toFixed(6)}
      </span>
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
          className={markerClassForStream(stream, selectedStream)}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          title={`${stream.title} / ${coordinateText(stream)}`}
          aria-label={`${stream.title} 위치 ${coordinateText(stream)}`}
        >
          <span className="offline-map-marker__dot" />
          <span className="offline-map-marker__label">{stream.title}</span>
        </button>
      ))}
    </div>
  );
}
