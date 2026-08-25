import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";

interface MapFocusGeometry {
  lat: number;
  lng: number;
}

interface LeafletTileConfig {
  attribution: string;
  urlTemplate: string;
}

interface UseLeafletTileMapOptions {
  initialCenter: MapFocusGeometry;
  initialZoom?: number;
  onTileError: () => void;
  onUserInteraction: () => void;
  tileConfig: LeafletTileConfig;
}

const INITIAL_PUBLIC_MAP_ZOOM = 14;
const USER_INTERACTION_EVENTS = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const;

export function useLeafletTileMap({
  initialCenter,
  initialZoom = INITIAL_PUBLIC_MAP_ZOOM,
  onTileError,
  onUserInteraction,
  tileConfig,
}: UseLeafletTileMapOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCenterRef = useRef(initialCenter);
  const mapRef = useRef<L.LeafletMap | null>(null);
  const [mapInstance, setMapInstance] = useState<L.LeafletMap | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return initializeLeafletMap(container, initialCenterRef.current, initialZoom, tileConfig, onTileError, onUserInteraction, (map) => {
      mapRef.current = map;
      setMapInstance(map);
    });
  }, [initialZoom, onTileError, onUserInteraction, tileConfig]);

  const focus = useCallback((geometry: MapFocusGeometry, isMotionEnabled: boolean): void => {
    mapRef.current?.panTo([geometry.lat, geometry.lng], {
      animate: isMotionEnabled,
      duration: isMotionEnabled ? 0.28 : 0,
    });
  }, []);

  const zoomIn = useCallback((): void => {
    mapRef.current?.zoomIn();
  }, []);

  const zoomOut = useCallback((): void => {
    mapRef.current?.zoomOut();
  }, []);

  return {
    containerRef,
    focus,
    mapInstance,
    zoomIn,
    zoomOut,
  } as const;
}

function initializeLeafletMap(
  container: HTMLDivElement,
  center: MapFocusGeometry,
  initialZoom: number,
  tileConfig: LeafletTileConfig,
  onTileError: () => void,
  onUserInteraction: () => void,
  onReady: (map: L.LeafletMap | null) => void,
): () => void {
  const map = L.map(container, { attributionControl: false, zoomControl: false })
    .setView([center.lat, center.lng], initialZoom, { animate: false });
  const tileLayer = L.tileLayer(tileConfig.urlTemplate, {
    attribution: tileConfig.attribution, maxZoom: 19, tileSize: 256,
  }).addTo(map);
  map.addControl(new L.Control.Attribution({ position: "bottomright", prefix: false }));
  tileLayer.on("tileerror", onTileError);
  USER_INTERACTION_EVENTS.forEach((eventName) => map.on(eventName, onUserInteraction));
  onReady(map);
  return () => {
    USER_INTERACTION_EVENTS.forEach((eventName) => map.off?.(eventName, onUserInteraction));
    tileLayer.off("tileerror", onTileError);
    onReady(null);
    map.remove();
  };
}
