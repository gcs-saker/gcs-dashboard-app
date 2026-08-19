import { useMemo, useState } from "react";

import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  coordinateSourceLabel,
  coordinateText,
  DEFAULT_MAP_CENTER,
  INITIAL_MAP_ZOOM,
  markerClassForStream,
  projectStreams,
} from "./mapContracts";
import { MapToolbar } from "./MapToolbar";
import { StreamMapMarkerContent } from "./StreamMapMarkerContent";
import { StreamMapPopup } from "./StreamMapPopup";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

export interface OfflineTacticalMapProps {
  activeStreamId: string | null;
  autoFocusEnabled: boolean;
  fallbackNotice: string | null;
  onAutoFocusChange: (enabled: boolean) => void;
  onStreamMarkerSelect: (streamId: string) => void;
  onStreamPopupClose: () => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

export function OfflineTacticalMap({
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
      <MapToolbar
        autoFocusEnabled={autoFocusEnabled}
        onAutoFocusClick={() => onAutoFocusChange(true)}
        onManualFocusClick={() => {
          onAutoFocusChange(false);
          setZoom(INITIAL_MAP_ZOOM);
        }}
        onZoomInClick={() => {
          onAutoFocusChange(false);
          setZoom((current) => Math.min(MAX_ZOOM, current + 1));
        }}
        onZoomOutClick={() => {
          onAutoFocusChange(false);
          setZoom((current) => Math.max(MIN_ZOOM, current - 1));
        }}
      />
      <OfflineMapMarkers projectedStreams={projectedStreams} selectedStream={selectedStream} onSelect={onStreamMarkerSelect} />
    </div>
  );
}

function OfflineMapMarkers({ projectedStreams, selectedStream, onSelect }: {
  projectedStreams: ReturnType<typeof projectStreams>;
  selectedStream: DashboardStreamSlot;
  onSelect: (streamId: string) => void;
}) {
  return <>{projectedStreams.map(({ stream, left, top }) => (
        <button
          key={stream.id}
          className={`${markerClassForStream(stream, selectedStream)} offline-map-marker--pin`}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          title={`${stream.title} / ${coordinateText(stream)}`}
          aria-label={`${stream.title} 위치 ${coordinateText(stream)}`}
          onClick={() => onSelect(stream.id)}
        >
          <StreamMapMarkerContent stream={stream} />
        </button>
      ))}</>;
}
