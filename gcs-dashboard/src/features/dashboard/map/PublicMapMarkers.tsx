import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { coordinateText, markerClassForStream } from "./mapContracts";
import { StreamMapMarkerContent } from "./StreamMapMarkerContent";

export interface StreamMarkerPosition {
  left: number;
  stream: DashboardStreamSlot;
  top: number;
}

interface PublicMapMarkersProps {
  markerPositions: StreamMarkerPosition[];
  onStreamMarkerSelect: (streamId: string) => void;
  selectedStream: DashboardStreamSlot;
}

export function PublicMapMarkers({
  markerPositions,
  onStreamMarkerSelect,
  selectedStream,
}: PublicMapMarkersProps) {
  return (
    <div className="tactical-map__marker-layer" aria-label="지도 스트림 마커">
      {markerPositions.map(({ left, stream, top }) => (
        <button
          key={stream.id}
          className={`${markerClassForStream(stream, selectedStream)} offline-map-marker--pin`}
          style={{ left, top }}
          type="button"
          title={`${stream.title} / ${coordinateText(stream)}`}
          aria-label={`${stream.title} 위치 ${coordinateText(stream)}, 상태 ${stream.status}${stream.geometry?.batteryPercent === undefined ? "" : `, 배터리 ${Math.round(stream.geometry.batteryPercent)}%`}`}
          onClick={() => onStreamMarkerSelect(stream.id)}
        >
          <StreamMapMarkerContent stream={stream} />
        </button>
      ))}
    </div>
  );
}
