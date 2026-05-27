import L, { type LatLngExpression, type LayerGroup, type Map as LeafletMap } from "leaflet";
import { useEffect, useRef } from "react";
import type { DashboardStreamSlot } from "../streamTypes";

interface TacticalLeafletMapProps {
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

const DEFAULT_CENTER: LatLngExpression = [37.123456, 127.123456];
const DEFAULT_ZOOM = 14;

function geometryForStream(stream: DashboardStreamSlot): LatLngExpression {
  return stream.geometry ? [stream.geometry.lat, stream.geometry.lng] : DEFAULT_CENTER;
}

export function TacticalLeafletMap({ selectedStream, streams }: TacticalLeafletMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;

    const map = L.map(mapElementRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const markerLayer = L.layerGroup().addTo(map);
    mapRef.current = map;
    markerLayerRef.current = markerLayer;

    return () => {
      markerLayer.remove();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();
    for (const stream of streams) {
      if (!stream.geometry) continue;
      const isSelected = stream.id === selectedStream.id;
      L.circleMarker(geometryForStream(stream), {
        color: isSelected ? "#3db8ff" : "#59d174",
        fillColor: isSelected ? "#3db8ff" : "#59d174",
        fillOpacity: isSelected ? 0.62 : 0.42,
        radius: isSelected ? 10 : 7,
      })
        .bindPopup(`<strong>${stream.title}</strong><br />${stream.streamPath ?? "stream pending"}`)
        .addTo(markerLayer);
    }
    map.setView(geometryForStream(selectedStream), Math.max(map.getZoom(), DEFAULT_ZOOM), {
      animate: true,
    });
  }, [selectedStream, streams]);

  return (
    <div className="tactical-map__canvas tactical-map__canvas--leaflet">
      <div ref={mapElementRef} className="tactical-map__leaflet" />
      <div className="map-toolbar" aria-label="지도 도구">
        <button aria-label="지도 중심 초기화" type="button" onClick={() => mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM)}>
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={() => mapRef.current?.zoomIn()}>
          ＋
        </button>
        <button aria-label="지도 축소" type="button" onClick={() => mapRef.current?.zoomOut()}>
          －
        </button>
      </div>
    </div>
  );
}
