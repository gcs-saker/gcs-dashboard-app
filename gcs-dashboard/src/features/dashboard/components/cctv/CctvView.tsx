import { CctvChannelCard } from "@dashboard/components/CctvChannelCard";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import type { CctvStatusSummary } from "@dashboard/streaming/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  CCTV_LAYOUT_MODE_OPTIONS,
  CCTV_QUALITY_MODE_OPTIONS,
  type CctvLayoutMode,
} from "@dashboard/preferences/userPreferences";
import type { CctvQualityMode } from "@dashboard/components/CctvChannelCard";

interface CctvViewProps {
  audioActiveStreamId: string | null;
  cctvGridSize: number;
  cctvLayoutMode: CctvLayoutMode;
  cctvQualityMode: CctvQualityMode;
  cctvStatusSummary: CctvStatusSummary;
  cctvStreams: DashboardStreamSlot[];
  onSelectStream: (streamId: string) => void;
  onSetLayoutMode: (mode: CctvLayoutMode) => void;
  onSetQualityMode: (mode: CctvQualityMode) => void;
  onToggleTalkbackTarget: (streamPath: string) => void;
  selectedStreamId: string;
  talkbackTargetStreamIds: string[];
}

export function CctvView({
  audioActiveStreamId,
  cctvGridSize,
  cctvLayoutMode,
  cctvQualityMode,
  cctvStatusSummary,
  cctvStreams,
  onSelectStream,
  onSetLayoutMode,
  onSetQualityMode,
  onToggleTalkbackTarget,
  selectedStreamId,
  talkbackTargetStreamIds,
}: CctvViewProps) {
  return (
    <section className="ops-dashboard__placeholder-view cctv-view" aria-label="CCTV">
      <CctvHeader {...{ cctvGridSize, cctvLayoutMode, cctvQualityMode, cctvStatusSummary, onSetLayoutMode, onSetQualityMode }} />
      <StreamGrid
        audioActiveStreamId={audioActiveStreamId}
        className={`stream-grid--cctv is-${cctvGridSize}x${cctvGridSize} is-${cctvQualityMode}`}
        onSelectStream={onSelectStream}
        onToggleTalkbackTarget={onToggleTalkbackTarget}
        renderCard={(stream, isSelected) => (
          <CctvChannelCard hasAudioActivity={stream.id === audioActiveStreamId} isSelected={isSelected}
            onSelect={onSelectStream} qualityMode={cctvQualityMode} stream={stream} />
        )}
        selectedStreamId={selectedStreamId}
        talkbackTargetStreamIds={talkbackTargetStreamIds}
        streams={cctvStreams}
      />
    </section>
  );
}

function CctvHeader(props: Pick<CctvViewProps, "cctvGridSize" | "cctvLayoutMode" | "cctvQualityMode" | "cctvStatusSummary" | "onSetLayoutMode" | "onSetQualityMode">) {
  return (
    <div className="cctv-view__header">
        <div>
          <h2>통합 CCTV 월</h2>
          <span>{props.cctvGridSize ** 2}채널 감시 레이아웃 · {props.cctvQualityMode === "preview" ? "저화질 Preview" : "고화질 확인"}</span>
        </div>
        <div className="cctv-view__summary" aria-label="CCTV 운영 요약">
          <span>LIVE {props.cctvStatusSummary.online}</span>
          <span>FALLBACK {props.cctvStatusSummary.fallback}</span>
          <span>OFFLINE {props.cctvStatusSummary.offline}</span>
        </div>
        <div className="cctv-view__controls" aria-label="CCTV 보기 설정">
          {CCTV_LAYOUT_MODE_OPTIONS.map((mode) => (
            <button
              aria-pressed={props.cctvLayoutMode === mode}
              className={props.cctvLayoutMode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => props.onSetLayoutMode(mode)}
              type="button"
            >
              {mode === "auto" ? "Auto" : mode}
            </button>
          ))}
          {CCTV_QUALITY_MODE_OPTIONS.map((mode) => (
            <button
              aria-pressed={props.cctvQualityMode === mode}
              className={props.cctvQualityMode === mode ? "is-active" : ""}
              key={mode}
              onClick={() => props.onSetQualityMode(mode)}
              type="button"
            >
              {mode === "preview" ? "저화질" : "고화질"}
            </button>
          ))}
        </div>
    </div>
  );
}
