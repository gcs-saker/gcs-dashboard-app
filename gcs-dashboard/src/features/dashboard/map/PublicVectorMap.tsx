import { useEffect, useMemo, useRef } from "react";
import { useState } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { DashboardMapConfig } from "@/config";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  coordinateSourceLabel,
  coordinateText,
  DEFAULT_MAP_CENTER,
  markerClassForStream,
} from "./mapContracts";
import { StreamMapPopup } from "./StreamMapPopup";

interface PublicVectorMapProps {
  activeStreamId: string | null;
  autoFocusEnabled: boolean;
  isMotionEnabled?: boolean;
  mapConfig: DashboardMapConfig;
  onAutoFocusChange: (enabled: boolean) => void;
  onStreamMarkerSelect: (streamId: string) => void;
  onStreamPopupClose: () => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  onMapError: () => void;
}

const INITIAL_PUBLIC_MAP_ZOOM = 14;
const USER_INTERACTION_EVENTS = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;
const MAP_POSITION_EVENTS = ["move", "zoom", "resize"] as const;

interface MapFocusGeometry {
  lat: number;
  lng: number;
}

interface StreamMarkerPosition {
  left: number;
  stream: DashboardStreamSlot;
  top: number;
}

export function PublicVectorMap({
  activeStreamId,
  autoFocusEnabled,
  isMotionEnabled = true,
  mapConfig,
  onAutoFocusChange,
  onStreamMarkerSelect,
  onStreamPopupClose,
  selectedStream,
  streams,
  onMapError,
}: PublicVectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.LeafletMap | null>(null);
  const [markerPositions, setMarkerPositions] = useState<StreamMarkerPosition[]>([]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
  const activeStream = streams.find((stream) => stream.id === activeStreamId) ?? null;
  const tileConfig = useMemo(() => tileConfigForMap(mapConfig), [mapConfig]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      attributionControl: false,
      zoomControl: false,
    }).setView([selectedGeometry.lat, selectedGeometry.lng], INITIAL_PUBLIC_MAP_ZOOM, { animate: false });
    const tileLayer = L.tileLayer(tileConfig.urlTemplate, {
      attribution: tileConfig.attribution,
      maxZoom: 19,
      tileSize: 256,
    }).addTo(map);
    const disableAutoFocus = () => onAutoFocusChange(false);
    map.addControl(new L.Control.Attribution({ position: "bottomright", prefix: false }));
    tileLayer.on("tileerror", onMapError);
    USER_INTERACTION_EVENTS.forEach((eventName) => map.on(eventName, disableAutoFocus));
    mapRef.current = map;

    return () => {
      USER_INTERACTION_EVENTS.forEach((eventName) => map.off?.(eventName, disableAutoFocus));
      tileLayer.off("tileerror", onMapError);
      mapRef.current = null;
      map.remove();
    };
  }, [onAutoFocusChange, onMapError, tileConfig.attribution, tileConfig.urlTemplate]);

  useEffect(() => {
    if (!autoFocusEnabled) return;
    focusSelectedStream(mapRef.current, selectedGeometry, isMotionEnabled);
  }, [autoFocusEnabled, isMotionEnabled, selectedGeometry.lat, selectedGeometry.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateMarkerPositions = () => {
      setMarkerPositions(
        streams
          .filter((stream) => stream.geometry)
          .map((stream) => {
            const geometry = stream.geometry ?? DEFAULT_MAP_CENTER;
            const point = map.latLngToContainerPoint([geometry.lat, geometry.lng]);
            return {
              left: point.x,
              stream,
              top: point.y,
            };
          }),
      );
    };

    updateMarkerPositions();
    MAP_POSITION_EVENTS.forEach((eventName) => map.on(eventName, updateMarkerPositions));
    return () => MAP_POSITION_EVENTS.forEach((eventName) => map.off(eventName, updateMarkerPositions));
  }, [selectedStream, streams]);

  const handleAutoFocusClick = () => {
    onAutoFocusChange(true);
    focusSelectedStream(mapRef.current, selectedGeometry, isMotionEnabled);
  };

  const handleManualFocusClick = () => {
    onAutoFocusChange(false);
    focusSelectedStream(mapRef.current, selectedGeometry, isMotionEnabled);
  };

  const handleZoomInClick = () => {
    onAutoFocusChange(false);
    mapRef.current?.zoomIn();
  };

  const handleZoomOutClick = () => {
    onAutoFocusChange(false);
    mapRef.current?.zoomOut();
  };

  return (
    <div
      className="tactical-map__canvas tactical-map__canvas--public"
      data-testid="public-tactical-map"
      aria-label="공개망 위성 전술 지도"
    >
      <div ref={containerRef} className="tactical-map__leaflet" />
      <div className="tactical-map__marker-layer" aria-label="지도 스트림 마커">
        {markerPositions.map(({ left, stream, top }) => (
          <button
            key={stream.id}
            className={`${markerClassForStream(stream, selectedStream)} offline-map-marker--pin`}
            style={{ left, top }}
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
      {activeStream ? <StreamMapPopup stream={activeStream} onClose={onStreamPopupClose} /> : null}
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
          onClick={handleAutoFocusClick}
        >
          Auto
        </button>
        <button aria-label="지도 중심 초기화" type="button" onClick={handleManualFocusClick}>
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={handleZoomInClick}>
          +
        </button>
        <button aria-label="지도 축소" type="button" onClick={handleZoomOutClick}>
          -
        </button>
      </div>
    </div>
  );
}

function focusSelectedStream(map: L.LeafletMap | null, geometry: MapFocusGeometry, isMotionEnabled: boolean): void {
  map?.panTo([geometry.lat, geometry.lng], {
    animate: isMotionEnabled,
    duration: isMotionEnabled ? 0.28 : 0,
  });
}

function tileConfigForMap(mapConfig: DashboardMapConfig): {
  attribution: string;
  urlTemplate: string;
} {
  return {
    attribution: mapConfig.attribution,
    urlTemplate: mapConfig.styleUrl,
  };
}
