import { useCallback, useMemo, useState } from "react";
import { MAP_PROVIDER } from "@/config";
import type { DashboardStreamSlot } from "../streamTypes";
import { PublicVectorMap } from "./PublicVectorMap";
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
  const [useOfflineMap, setUseOfflineMap] = useState(MAP_PROVIDER === "offline");
  const handleMapError = useCallback(() => setUseOfflineMap(true), []);

  if (!useOfflineMap) {
    return (
      <PublicVectorMap
        selectedStream={selectedStream}
        streams={streams}
        onMapError={handleMapError}
      />
    );
  }

  return <OfflineTacticalMap selectedStream={selectedStream} streams={streams} />;
}

function OfflineTacticalMap({ selectedStream, streams }: TacticalLeafletMapProps) {
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
        <button aria-label="지도 중심 초기화" type="button" onClick={() => setZoom(INITIAL_MAP_ZOOM)}>
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 1))}>
          +
        </button>
        <button aria-label="지도 축소" type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 1))}>
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
