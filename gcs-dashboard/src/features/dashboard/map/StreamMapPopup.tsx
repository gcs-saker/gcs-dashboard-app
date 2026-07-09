import { useState } from "react";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import { getDashboardStreamStatusText } from "@dashboard/streamTypes";
import { coordinateSourceLabel, coordinateText } from "./mapContracts";

interface StreamMapPopupProps {
  onClose: () => void;
  stream: DashboardStreamSlot;
}

export function StreamMapPopup({ onClose, stream }: StreamMapPopupProps) {
  const geometry = stream.geometry;
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
      <dl>
        <div>
          <dt>상태</dt>
          <dd>{getDashboardStreamStatusText(stream.status)}</dd>
        </div>
        <div>
          <dt>단말 ID</dt>
          <dd>{stream.connectedDeviceId ?? "미등록"}</dd>
        </div>
        <div>
          <dt>스트림</dt>
          <dd>{stream.streamPath ?? stream.id}</dd>
        </div>
        <div>
          <dt>미디어</dt>
          <dd>{stream.mode}</dd>
        </div>
        <div>
          <dt>입력</dt>
          <dd>{stream.sourceUrl ?? "서버 registry"}</dd>
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
      </dl>
      <div className="stream-map-popup__actions">
        <button type="button" onClick={() => void copyCoordinates()}>
          좌표 복사
        </button>
        <span role="status">
          {copyState === "copied" ? "복사됨" : copyState === "failed" ? "복사 실패" : "좌표 공유"}
        </span>
      </div>
    </aside>
  );
}
