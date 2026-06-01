import { useCallback, useMemo, useRef, useState } from "react";
import type { MapCoordinate } from "./tacticalMapGeometry";

export interface CustomMapMarker {
  id: string;
  label: string;
  coordinate: MapCoordinate;
  locked: boolean;
}

export interface CustomMarkerDraft {
  label: string;
  lat: string;
  lng: string;
}

export function draftFromCoordinate(coordinate: MapCoordinate, label = "작전 핀"): CustomMarkerDraft {
  return {
    label,
    lat: coordinate.lat.toFixed(6),
    lng: coordinate.lng.toFixed(6),
  };
}

export function coordinateFromDraft(draft: CustomMarkerDraft): MapCoordinate | null {
  const lat = Number.parseFloat(draft.lat);
  const lng = Number.parseFloat(draft.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function useCustomMapMarkers() {
  const nextMarkerIndexRef = useRef(1);
  const [markers, setMarkers] = useState<CustomMapMarker[]>([]);
  const [routeMarkerIds, setRouteMarkerIds] = useState<string[]>([]);

  const routeMarkers = useMemo(
    () => routeMarkerIds.flatMap((id) => markers.find((marker) => marker.id === id) ?? []),
    [markers, routeMarkerIds],
  );

  const addMarker = useCallback((draft: CustomMarkerDraft): CustomMapMarker | null => {
    const coordinate = coordinateFromDraft(draft);
    const label = draft.label.trim();
    if (!coordinate || !label) return null;

    const marker: CustomMapMarker = {
      id: `custom-marker-${nextMarkerIndexRef.current}`,
      label,
      coordinate,
      locked: true,
    };
    nextMarkerIndexRef.current += 1;
    setMarkers((current) => [...current, marker]);
    return marker;
  }, []);

  const updateMarkerCoordinate = useCallback((markerId: string, coordinate: MapCoordinate) => {
    setMarkers((current) =>
      current.map((marker) => (marker.id === markerId && !marker.locked ? { ...marker, coordinate } : marker)),
    );
  }, []);

  const updateMarkerFromDraft = useCallback((markerId: string, draft: CustomMarkerDraft): boolean => {
    const coordinate = coordinateFromDraft(draft);
    const label = draft.label.trim();
    if (!coordinate || !label) return false;
    setMarkers((current) =>
      current.map((marker) => (marker.id === markerId ? { ...marker, label, coordinate } : marker)),
    );
    return true;
  }, []);

  const toggleMarkerLocked = useCallback((markerId: string) => {
    setMarkers((current) =>
      current.map((marker) => (marker.id === markerId ? { ...marker, locked: !marker.locked } : marker)),
    );
  }, []);

  const removeMarker = useCallback((markerId: string) => {
    setMarkers((current) => current.filter((marker) => marker.id !== markerId));
    setRouteMarkerIds((current) => current.filter((id) => id !== markerId));
  }, []);

  const toggleRouteMarker = useCallback((markerId: string) => {
    setRouteMarkerIds((current) =>
      current.includes(markerId) ? current.filter((id) => id !== markerId) : [...current, markerId],
    );
  }, []);

  return {
    addMarker,
    markers,
    removeMarker,
    routeMarkerIds,
    routeMarkers,
    toggleMarkerLocked,
    toggleRouteMarker,
    updateMarkerCoordinate,
    updateMarkerFromDraft,
  };
}
