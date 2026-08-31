import { useCallback, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";

import type { DashboardMapConfig } from "@/config";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  coordinateSourceLabel,
  DEFAULT_MAP_CENTER,
} from "./mapContracts";
import { MapToolbar } from "./MapToolbar";
import { PublicMapMarkers } from "./PublicMapMarkers";
import { StreamMapPopup } from "./StreamMapPopup";
import { useLeafletTileMap } from "./useLeafletTileMap";
import { usePublicVectorMapMarkers } from "./usePublicVectorMapMarkers";
import { MapLayerSelector, type MapLayerMode } from "./MapLayerSelector";

const SATELLITE_INITIAL_ZOOM = 14;
const STREET_INITIAL_ZOOM = 12;

interface PublicVectorMapProps {
  activeStreamId: string | null;
  autoFocusEnabled: boolean;
  isMotionEnabled?: boolean;
  layerMode: MapLayerMode;
  mapConfig: DashboardMapConfig;
  onAutoFocusChange: (enabled: boolean) => void;
  onStreamMarkerSelect: (streamId: string) => void;
  onStreamPopupClose: () => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  onMapError: () => void;
  onLayerModeChange: (mode: MapLayerMode) => void;
}

export function PublicVectorMap({
  activeStreamId,
  autoFocusEnabled,
  isMotionEnabled = true,
  layerMode,
  mapConfig,
  onAutoFocusChange,
  onStreamMarkerSelect,
  onStreamPopupClose,
  selectedStream,
  streams,
  onMapError,
  onLayerModeChange,
}: PublicVectorMapProps) {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.publicVectorMap);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
  const activeStream = streams.find((stream) => stream.id === activeStreamId) ?? null;
  const tileConfig = useMemo(() => ({
    attribution: mapConfig.attribution,
    urlTemplate: mapConfig.styleUrl,
  }), [mapConfig.attribution, mapConfig.styleUrl]);
  const disableAutoFocus = useCallback(() => onAutoFocusChange(false), [onAutoFocusChange]);
  const { containerRef, focus, mapInstance, zoomIn, zoomOut } = useLeafletTileMap({
    initialCenter: selectedGeometry,
    initialZoom: layerMode === "street" ? STREET_INITIAL_ZOOM : SATELLITE_INITIAL_ZOOM,
    onTileError: onMapError,
    onUserInteraction: disableAutoFocus,
    tileConfig,
  });
  const markerPositions = usePublicVectorMapMarkers(mapInstance, streams);
  const controls = usePublicMapControls({ autoFocusEnabled, focus, isMotionEnabled,
    onAutoFocusChange, selectedGeometry, zoomIn, zoomOut });

  return (
    <div className="tactical-map__canvas tactical-map__canvas--public"
      data-testid="public-tactical-map" aria-label="공개망 위성 전술 지도">
      <div ref={containerRef} className="tactical-map__leaflet" />
      <PublicMapMarkers markerPositions={markerPositions} onStreamMarkerSelect={onStreamMarkerSelect}
        selectedStream={selectedStream} />
      {activeStream ? <StreamMapPopup stream={activeStream} onClose={onStreamPopupClose} /> : null}
      <span className="map-coordinate-source" data-testid="map-coordinate-source">{coordinateSourceLabel(selectedStream)}</span>
      <span className="offline-map-center" data-testid="offline-map-center">
        중심 {selectedGeometry.lat.toFixed(6)}, {selectedGeometry.lng.toFixed(6)}
      </span>
      <MapToolbar autoFocusEnabled={autoFocusEnabled} {...controls} />
      <MapLayerSelector mode={layerMode} onChange={onLayerModeChange} />
    </div>
  );
}

function usePublicMapControls(input: {
  autoFocusEnabled: boolean;
  focus: (geometry: { lat: number; lng: number }, motion: boolean) => void;
  isMotionEnabled: boolean;
  onAutoFocusChange: (enabled: boolean) => void;
  selectedGeometry: { lat: number; lng: number };
  zoomIn: () => void;
  zoomOut: () => void;
}) {
  const { autoFocusEnabled, focus, isMotionEnabled, onAutoFocusChange, selectedGeometry, zoomIn, zoomOut } = input;
  useEffect(() => {
    if (autoFocusEnabled) focus(selectedGeometry, isMotionEnabled);
  }, [autoFocusEnabled, focus, isMotionEnabled, selectedGeometry]);
  const onAutoFocusClick = () => {
    onAutoFocusChange(true);
    focus(selectedGeometry, isMotionEnabled);
  };
  const onManualFocusClick = () => {
    onAutoFocusChange(false);
    focus(selectedGeometry, isMotionEnabled);
  };
  const onZoomInClick = () => {
    zoomIn();
    onAutoFocusChange(true);
    focus(selectedGeometry, false);
  };
  const onZoomOutClick = () => {
    zoomOut();
    onAutoFocusChange(true);
    focus(selectedGeometry, false);
  };
  return { onAutoFocusClick, onManualFocusClick, onZoomInClick, onZoomOutClick };
}
