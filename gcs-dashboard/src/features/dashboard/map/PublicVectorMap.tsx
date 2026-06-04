import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import type { DashboardMapConfig } from "@/config";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  coordinateSourceLabel,
  coordinateText,
  DEFAULT_MAP_CENTER,
  INITIAL_MAP_ZOOM,
  markerClassForStream,
  projectStreams,
} from "./mapContracts";

interface PublicVectorMapProps {
  mapConfig: DashboardMapConfig;
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
  onMapError: () => void;
}

const INITIAL_PUBLIC_MAP_ZOOM = 14;

export function PublicVectorMap({ mapConfig, selectedStream, streams, onMapError }: PublicVectorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
  const projectedStreams = useMemo(
    () => projectStreams(streams, selectedStream, INITIAL_MAP_ZOOM),
    [selectedStream, streams],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: mapConfig.styleUrl,
      center: [selectedGeometry.lng, selectedGeometry.lat],
      zoom: INITIAL_PUBLIC_MAP_ZOOM,
      attributionControl: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("error", onMapError);
    mapRef.current = map;

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [mapConfig.styleUrl, onMapError]);

  useEffect(() => {
    mapRef.current?.easeTo({
      center: [selectedGeometry.lng, selectedGeometry.lat],
      duration: 280,
      essential: true,
    });
  }, [selectedGeometry.lat, selectedGeometry.lng]);

  return (
    <div
      className="tactical-map__canvas tactical-map__canvas--public"
      data-testid="public-tactical-map"
      aria-label="공개망 OpenFreeMap 전술 지도"
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
          aria-label="지도 중심 초기화"
          type="button"
          onClick={() =>
            mapRef.current?.easeTo({
              center: [selectedGeometry.lng, selectedGeometry.lat],
              zoom: INITIAL_PUBLIC_MAP_ZOOM,
              duration: 220,
              essential: true,
            })
          }
        >
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={() => mapRef.current?.zoomIn()}>
          +
        </button>
        <button aria-label="지도 축소" type="button" onClick={() => mapRef.current?.zoomOut()}>
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
