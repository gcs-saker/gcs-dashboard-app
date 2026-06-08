import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { DashboardMapConfig } from "@/config";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  coordinateSourceLabel,
  coordinateText,
  DEFAULT_MAP_CENTER,
  markerClassForStream,
} from "./mapContracts";

interface PublicVectorMapProps {
  autoFocusEnabled: boolean;
  mapConfig: DashboardMapConfig;
  onAutoFocusChange: (enabled: boolean) => void;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  onMapError: () => void;
}

const INITIAL_PUBLIC_MAP_ZOOM = 14;
const USER_INTERACTION_EVENTS = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;

interface MapFocusGeometry {
  lat: number;
  lng: number;
}

export function PublicVectorMap({
  autoFocusEnabled,
  mapConfig,
  onAutoFocusChange,
  selectedStream,
  streams,
  onMapError,
}: PublicVectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
  const publicMapStyle = useMemo(() => mapStyleForConfig(mapConfig), [mapConfig]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: publicMapStyle,
      center: [selectedGeometry.lng, selectedGeometry.lat],
      zoom: INITIAL_PUBLIC_MAP_ZOOM,
      attributionControl: false,
    });
    const disableAutoFocus = () => onAutoFocusChange(false);
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("error", onMapError);
    USER_INTERACTION_EVENTS.forEach((eventName) => map.on(eventName, disableAutoFocus));
    mapRef.current = map;

    return () => {
      USER_INTERACTION_EVENTS.forEach((eventName) => map.off?.(eventName, disableAutoFocus));
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current = null;
      map.remove();
    };
  }, [onAutoFocusChange, onMapError, publicMapStyle]);

  useEffect(() => {
    if (!autoFocusEnabled) return;
    focusSelectedStream(mapRef.current, selectedGeometry);
  }, [autoFocusEnabled, selectedGeometry.lat, selectedGeometry.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = streams
      .filter((stream) => stream.geometry)
      .map((stream) =>
        new maplibregl.Marker({
          anchor: "bottom",
          element: createStreamMarkerElement(stream, selectedStream),
        })
          .setLngLat([stream.geometry?.lng ?? DEFAULT_MAP_CENTER.lng, stream.geometry?.lat ?? DEFAULT_MAP_CENTER.lat])
          .addTo(map),
      );

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [selectedStream, streams]);

  const handleAutoFocusClick = () => {
    onAutoFocusChange(true);
    focusSelectedStream(mapRef.current, selectedGeometry);
  };

  const handleManualFocusClick = () => {
    onAutoFocusChange(false);
    focusSelectedStream(mapRef.current, selectedGeometry);
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
      <div ref={containerRef} className="tactical-map__maplibre" />
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

function focusSelectedStream(map: maplibregl.Map | null, geometry: MapFocusGeometry): void {
  map?.easeTo({
    center: [geometry.lng, geometry.lat],
    duration: 280,
    essential: true,
  });
}

function mapStyleForConfig(mapConfig: DashboardMapConfig): string | StyleSpecification {
  if (mapConfig.provider !== "esri-satellite") {
    return mapConfig.styleUrl;
  }

  return {
    version: 8,
    sources: {
      satellite: {
        attribution: mapConfig.attribution,
        tiles: [mapConfig.styleUrl],
        tileSize: 256,
        type: "raster",
      },
    },
    layers: [
      {
        id: "satellite",
        source: "satellite",
        type: "raster",
      },
    ],
  };
}

function createStreamMarkerElement(stream: DashboardStreamSlot, selectedStream: DashboardStreamSlot): HTMLButtonElement {
  const marker = document.createElement("button");
  marker.className = `${markerClassForStream(stream, selectedStream)} offline-map-marker--pin`;
  marker.type = "button";
  marker.title = `${stream.title} / ${coordinateText(stream)}`;
  marker.setAttribute("aria-label", `${stream.title} 위치 ${coordinateText(stream)}`);

  const dot = document.createElement("span");
  dot.className = "offline-map-marker__dot";

  const label = document.createElement("span");
  label.className = "offline-map-marker__label";
  label.textContent = stream.title;

  marker.append(dot, label);
  return marker;
}
