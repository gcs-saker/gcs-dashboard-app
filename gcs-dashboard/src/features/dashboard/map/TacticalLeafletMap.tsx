import { useMemo, useState } from "react";
import type { FormEvent, MouseEvent, PointerEvent } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import { coordinateFromMapPercent, formatCoordinate, projectCoordinate } from "./tacticalMapGeometry";
import type { MapCoordinate, MapPoint } from "./tacticalMapGeometry";
import {
  draftFromCoordinate,
  type CustomMarkerDraft,
  useCustomMapMarkers,
} from "./useCustomMapMarkers";

interface TacticalLeafletMapProps {
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

interface ProjectedStream {
  stream: DashboardStreamSlot;
  left: number;
  top: number;
}

const DEFAULT_CENTER = { lat: 35.871435, lng: 128.601445 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const INITIAL_ZOOM = 3;

function coordinateSourceLabel(stream: DashboardStreamSlot): string {
  switch (stream.geometry?.source) {
    case "telemetry":
      return "실시간 GPS";
    case "device":
      return "장비 좌표";
    case "registry":
      return "등록 좌표";
    case "mock":
    case undefined:
      return "내장 오프라인 지도";
  }
}

function projectStreams(streams: DashboardStreamSlot[], selectedStream: DashboardStreamSlot, zoom: number): ProjectedStream[] {
  const geometricStreams = streams.filter((stream) => stream.geometry);
  const center = selectedStream.geometry ?? DEFAULT_CENTER;

  return geometricStreams.map((stream) => {
    const geometry = stream.geometry ?? center;
    const point = projectCoordinate(geometry, center, zoom);
    return {
      stream,
      left: point.left,
      top: point.top,
    };
  });
}

function markerClassForStream(stream: DashboardStreamSlot, selectedStream: DashboardStreamSlot): string {
  const classes = ["offline-map-marker"];
  if (stream.id === selectedStream.id) classes.push("is-selected");
  if (stream.status === "fallback" || stream.status === "degraded") classes.push("is-warning");
  if (stream.status === "offline") classes.push("is-offline");
  return classes.join(" ");
}

function coordinateText(stream: DashboardStreamSlot): string {
  if (!stream.geometry) return "좌표 대기 중";
  return formatCoordinate(stream.geometry);
}

function percentFromPointer(event: PointerEvent<HTMLElement> | MouseEvent<HTMLElement>): MapPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);
  return {
    left: Math.min(100, Math.max(0, ((event.clientX - rect.left) / width) * 100)),
    top: Math.min(100, Math.max(0, ((event.clientY - rect.top) / height) * 100)),
  };
}

export function TacticalLeafletMap({ selectedStream, streams }: TacticalLeafletMapProps) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [hoverCoordinate, setHoverCoordinate] = useState<MapCoordinate | null>(null);
  const [isMarkerFormOpen, setIsMarkerFormOpen] = useState(false);
  const [markerDraft, setMarkerDraft] = useState<CustomMarkerDraft>(() => draftFromCoordinate(DEFAULT_CENTER));
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<CustomMarkerDraft>(() => draftFromCoordinate(DEFAULT_CENTER));
  const [movingMarkerId, setMovingMarkerId] = useState<string | null>(null);
  const {
    addMarker,
    markers,
    removeMarker,
    routeMarkerIds,
    routeMarkers,
    toggleMarkerLocked,
    toggleRouteMarker,
    updateMarkerCoordinate,
    updateMarkerFromDraft,
  } = useCustomMapMarkers();
  const projectedStreams = useMemo(() => projectStreams(streams, selectedStream, zoom), [selectedStream, streams, zoom]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_CENTER;
  const projectedMarkers = useMemo(
    () =>
      markers.map((marker) => ({
        marker,
        ...projectCoordinate(marker.coordinate, selectedGeometry, zoom),
      })),
    [markers, selectedGeometry, zoom],
  );
  const routePoints = useMemo(
    () => routeMarkers.map((marker) => projectCoordinate(marker.coordinate, selectedGeometry, zoom)),
    [routeMarkers, selectedGeometry, zoom],
  );
  const activeMarker = markers.find((marker) => marker.id === activeMarkerId);

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    setHoverCoordinate(coordinateFromMapPercent(percentFromPointer(event), selectedGeometry, zoom));
  };

  const handleMapClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, form, label")) return;
    if (!movingMarkerId) return;
    const point = percentFromPointer(event);
    updateMarkerCoordinate(movingMarkerId, coordinateFromMapPercent(point, selectedGeometry, zoom));
    setMovingMarkerId(null);
  };

  const openMarkerForm = () => {
    const coordinate = hoverCoordinate ?? selectedGeometry;
    setMarkerDraft(draftFromCoordinate(coordinate));
    setActiveMarkerId(null);
    setIsMarkerFormOpen(true);
  };

  const submitMarkerDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const marker = addMarker(markerDraft);
    if (!marker) return;
    setActiveMarkerId(marker.id);
    setEditingDraft(draftFromCoordinate(marker.coordinate, marker.label));
    setIsMarkerFormOpen(false);
  };

  const openMarkerEditor = (markerId: string) => {
    const marker = markers.find((item) => item.id === markerId);
    if (!marker) return;
    setActiveMarkerId(marker.id);
    setEditingDraft(draftFromCoordinate(marker.coordinate, marker.label));
  };

  const submitMarkerEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeMarkerId) return;
    updateMarkerFromDraft(activeMarkerId, editingDraft);
  };

  return (
    <div
      className="tactical-map__canvas tactical-map__canvas--offline"
      data-testid="offline-tactical-map"
      aria-label="폐쇄망 오프라인 전술 지도"
      onClick={handleMapClick}
      onPointerLeave={() => setHoverCoordinate(null)}
      onPointerMove={handlePointerMove}
    >
      <div className="offline-map-grid" aria-hidden="true" />
      <div className="offline-map-roads" aria-hidden="true" />
      <div className="offline-map-river" aria-hidden="true" />
      <span className="map-coordinate-source" data-testid="map-coordinate-source">
        {coordinateSourceLabel(selectedStream)}
      </span>
      <span className="map-hover-coordinate" data-testid="map-hover-coordinate">
        마우스 {hoverCoordinate ? formatCoordinate(hoverCoordinate) : "지도 위 대기"}
      </span>
      <span className="offline-map-center" data-testid="offline-map-center">
        중심 {selectedGeometry.lat.toFixed(6)}, {selectedGeometry.lng.toFixed(6)}
      </span>
      {routePoints.length > 1 ? (
        <svg className="custom-map-route" aria-label="선택 핀 경로" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={routePoints.map((point) => `${point.left},${point.top}`).join(" ")} />
        </svg>
      ) : null}
      <div className="map-toolbar" aria-label="지도 도구">
        <button aria-label="지도 중심 초기화" type="button" onClick={() => setZoom(INITIAL_ZOOM)}>
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 1))}>
          +
        </button>
        <button aria-label="지도 축소" type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 1))}>
          -
        </button>
        <button aria-label="커스텀 마커 추가" type="button" onClick={openMarkerForm}>
          ⊕
        </button>
      </div>
      {isMarkerFormOpen ? (
        <form className="custom-marker-form" aria-label="커스텀 마커 추가 입력" onSubmit={submitMarkerDraft}>
          <label>
            이름
            <input
              value={markerDraft.label}
              onChange={(event) => setMarkerDraft((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
          <label>
            위도
            <input
              inputMode="decimal"
              value={markerDraft.lat}
              onChange={(event) => setMarkerDraft((current) => ({ ...current, lat: event.target.value }))}
            />
          </label>
          <label>
            경도
            <input
              inputMode="decimal"
              value={markerDraft.lng}
              onChange={(event) => setMarkerDraft((current) => ({ ...current, lng: event.target.value }))}
            />
          </label>
          <span className="custom-marker-form__actions">
            <button type="submit">추가</button>
            <button type="button" onClick={() => setIsMarkerFormOpen(false)}>
              취소
            </button>
          </span>
        </form>
      ) : null}
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
      {projectedMarkers.map(({ marker, left, top }) => (
        <button
          key={marker.id}
          className={`custom-map-marker ${marker.locked ? "is-locked" : "is-unlocked"} ${
            routeMarkerIds.includes(marker.id) ? "is-route-point" : ""
          }`}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          title={`${marker.label} / ${formatCoordinate(marker.coordinate)}`}
          aria-label={`${marker.label} 커스텀 마커 ${formatCoordinate(marker.coordinate)}`}
          onClick={() => openMarkerEditor(marker.id)}
        >
          <span aria-hidden="true">{marker.locked ? "⌾" : "✥"}</span>
          <span>{marker.label}</span>
        </button>
      ))}
      {activeMarker ? (
        <form
          className="custom-marker-editor"
          aria-label="커스텀 마커 편집"
          onClick={(event) => event.stopPropagation()}
          onSubmit={submitMarkerEdit}
        >
          <strong>{activeMarker.label}</strong>
          <small>{formatCoordinate(activeMarker.coordinate)}</small>
          <label>
            이름
            <input
              value={editingDraft.label}
              onChange={(event) => setEditingDraft((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
          <label>
            위도
            <input
              inputMode="decimal"
              value={editingDraft.lat}
              onChange={(event) => setEditingDraft((current) => ({ ...current, lat: event.target.value }))}
            />
          </label>
          <label>
            경도
            <input
              inputMode="decimal"
              value={editingDraft.lng}
              onChange={(event) => setEditingDraft((current) => ({ ...current, lng: event.target.value }))}
            />
          </label>
          <span className="custom-marker-editor__actions">
            <button type="submit">적용</button>
            <button type="button" onClick={() => toggleMarkerLocked(activeMarker.id)}>
              {activeMarker.locked ? "고정 해제" : "고정"}
            </button>
            <button
              type="button"
              disabled={activeMarker.locked}
              onClick={() => {
                setMovingMarkerId(activeMarker.id);
                setActiveMarkerId(null);
              }}
            >
              이동
            </button>
            <button type="button" onClick={() => toggleRouteMarker(activeMarker.id)}>
              {routeMarkerIds.includes(activeMarker.id) ? "경로 제외" : "경로 선택"}
            </button>
            <button type="button" onClick={() => removeMarker(activeMarker.id)}>
              삭제
            </button>
            <button type="button" onClick={() => setActiveMarkerId(null)}>
              닫기
            </button>
          </span>
        </form>
      ) : null}
      {movingMarkerId ? <span className="map-move-hint">지도 위치를 눌러 마커를 이동</span> : null}
    </div>
  );
}
