import { useEffect, useState } from "react";
import type * as L from "leaflet";

import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { DEFAULT_MAP_CENTER } from "./mapContracts";
import type { StreamMarkerPosition } from "./PublicMapMarkers";

const MAP_POSITION_EVENTS = ["move", "zoom", "resize"] as const;

export function usePublicVectorMapMarkers(
  map: L.LeafletMap | null,
  streams: DashboardStreamSlot[],
): StreamMarkerPosition[] {
  const [markerPositions, setMarkerPositions] = useState<StreamMarkerPosition[]>([]);

  useEffect(() => {
    if (!map) return;

    const updateMarkerPositions = () => {
      setMarkerPositions(
        streams
          .filter((stream) => stream.geometry)
          .map((stream) => markerPositionForStream(map, stream)),
      );
    };

    updateMarkerPositions();
    MAP_POSITION_EVENTS.forEach((eventName) => map.on(eventName, updateMarkerPositions));
    return () => MAP_POSITION_EVENTS.forEach((eventName) => map.off(eventName, updateMarkerPositions));
  }, [map, streams]);

  return markerPositions;
}

function markerPositionForStream(
  map: L.LeafletMap,
  stream: DashboardStreamSlot,
): StreamMarkerPosition {
  const geometry = stream.geometry ?? DEFAULT_MAP_CENTER;
  const point = map.latLngToContainerPoint([geometry.lat, geometry.lng]);
  return {
    left: point.x,
    stream,
    top: point.y,
  };
}
