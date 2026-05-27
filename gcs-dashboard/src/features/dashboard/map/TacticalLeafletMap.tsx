import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { DashboardStreamSlot } from "../streamTypes";

interface TacticalLeafletMapProps {
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

const DEFAULT_CENTER: [number, number] = [37.123456, 127.123456];
const DEFAULT_ZOOM = 14;

function geometryForStream(stream: DashboardStreamSlot): [number, number] {
  return stream.geometry ? [stream.geometry.lat, stream.geometry.lng] : DEFAULT_CENTER;
}

function MapFocusController({ stream }: { stream: DashboardStreamSlot }) {
  const map = useMap();

  useEffect(() => {
    map.setView(geometryForStream(stream), Math.max(map.getZoom(), DEFAULT_ZOOM), { animate: true });
  }, [map, stream]);

  return null;
}

function ZoomButtons() {
  const map = useMap();

  return (
    <div className="map-toolbar" aria-label="지도 도구">
      <button type="button" onClick={() => map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)}>
        ⌖
      </button>
      <button type="button" onClick={() => map.zoomIn()}>
        ＋
      </button>
      <button type="button" onClick={() => map.zoomOut()}>
        －
      </button>
    </div>
  );
}

export function TacticalLeafletMap({ selectedStream, streams }: TacticalLeafletMapProps) {
  const selectedCenter = geometryForStream(selectedStream);

  return (
    <div className="tactical-map__canvas tactical-map__canvas--leaflet">
      <MapContainer
        center={selectedCenter}
        className="tactical-map__leaflet"
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocusController stream={selectedStream} />
        <ZoomButtons />
        {streams
          .filter((stream) => stream.geometry)
          .map((stream) => {
            const isSelected = stream.id === selectedStream.id;
            return (
              <CircleMarker
                center={geometryForStream(stream)}
                className={isSelected ? "is-selected" : ""}
                key={stream.id}
                pathOptions={{
                  color: isSelected ? "#3db8ff" : "#59d174",
                  fillColor: isSelected ? "#3db8ff" : "#59d174",
                  fillOpacity: isSelected ? 0.62 : 0.42,
                }}
                radius={isSelected ? 10 : 7}
              >
                <Popup>
                  <strong>{stream.title}</strong>
                  <br />
                  {stream.streamPath ?? "stream pending"}
                </Popup>
              </CircleMarker>
            );
          })}
      </MapContainer>
    </div>
  );
}
