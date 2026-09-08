import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { getDashboardStreamStatusText } from "@dashboard/streaming/streamTypes";

interface StreamMapMarkerContentProps {
  stream: DashboardStreamSlot;
}

export function StreamMapMarkerContent({ stream }: StreamMapMarkerContentProps) {
  const battery = stream.geometry?.batteryPercent;

  return (
    <>
      <span className="offline-map-marker__dot" />
      <span className="offline-map-marker__label">{stream.title}</span>
      <span className="offline-map-marker__badges">
        <span className="offline-map-marker__badge">{getDashboardStreamStatusText(stream.status)}</span>
        {battery === undefined ? null : (
          <span className="offline-map-marker__badge">{Math.round(battery)}%</span>
        )}
      </span>
    </>
  );
}
