import { useState } from "react";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { getDashboardStreamDisplayName, getDashboardStreamStatusText } from "@dashboard/streaming/streamTypes";
import { coordinateSourceLabel, coordinateText } from "./mapContracts";

interface StreamMapPopupProps {
  onClose: () => void;
  stream: DashboardStreamSlot;
}

export function StreamMapPopup({ onClose, stream }: StreamMapPopupProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const coordinates = coordinateText(stream);
  const copyCoordinates = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(coordinates);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <aside className="stream-map-popup" aria-label={`${stream.title} 단말 정보`}>
      <div className="stream-map-popup__header">
        <div>
          <span>{coordinateSourceLabel(stream)}</span>
          <strong>{stream.title}</strong>
        </div>
        <button type="button" aria-label="지도 정보 닫기" onClick={onClose}>
          X
        </button>
      </div>
      <StreamMapDetails coordinates={coordinates} stream={stream} />
      <div className="stream-map-popup__actions">
        <button type="button" onClick={() => void copyCoordinates()}>좌표 복사</button>
        <span role="status">{copyState === "copied" ? "복사됨" : copyState === "failed" ? "복사 실패" : "좌표 공유"}</span>
      </div>
    </aside>
  );
}

function StreamMapDetails({ coordinates, stream }: { coordinates: string; stream: DashboardStreamSlot }) {
  const geometry = stream.geometry;
  return <dl>
        <div>
          <dt>상태</dt>
          <dd><span className="stream-map-popup__badge">{getDashboardStreamStatusText(stream.status)}</span></dd>
        </div>
        <div>
          <dt>배터리</dt>
          <dd>
            <span className="stream-map-popup__badge">
              {geometry?.batteryPercent === undefined ? "대기" : `${Math.round(geometry.batteryPercent)}%`}
            </span>
          </dd>
        </div>
        <div>
          <dt>연결 상태</dt>
          <dd>{stream.connectedDeviceId ? "연결됨" : "미등록"}</dd>
        </div>
        <div>
          <dt>스트림</dt>
          <dd>{getDashboardStreamDisplayName(stream)}</dd>
        </div>
        <div>
          <dt>미디어</dt>
          <dd>{stream.mode}</dd>
        </div>
        <div>
          <dt>입력</dt>
          <dd>서버 스트림 목록</dd>
        </div>
        <div>
          <dt>좌표</dt>
          <dd>{coordinates}</dd>
        </div>
        <div>
          <dt>고도</dt>
          <dd>{geometry ? `${Math.round(geometry.altitudeM)} m` : "대기"}</dd>
        </div>
        <div>
          <dt>방위/FOV</dt>
          <dd>{geometry ? `${Math.round(geometry.headingDeg)}deg / ${Math.round(geometry.fovDeg)}deg` : "대기"}</dd>
        </div>
  </dl>;
}
