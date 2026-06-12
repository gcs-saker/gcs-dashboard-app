import { lazy, Suspense, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { SelectedStreamPanel } from "./components/SelectedStreamPanel";
import { StreamGrid } from "./components/StreamGrid";
import { WidgetAddDialog } from "./components/WidgetAddDialog";
import { WidgetHeaderActions } from "./components/WidgetHeaderActions";
import { WidgetPopout } from "./components/WidgetPopout";
import { StreamDeviceConnectDialog } from "./components/StreamDeviceConnectDialog";
import { AssetTreePanel } from "./components/AssetTreePanel";
import { SystemStatusPanel } from "./components/SystemStatusPanel";
import { TalkbackControlPanel } from "./components/TalkbackControlPanel";
import { DEFAULT_ASSET_TREE, mergeAssetTreeWithStreams } from "./assetTree";
import {
  getDashboardWidgetDefinition,
  resetDashboardLayout,
  setDashboardWidgetPinned,
  setDashboardWidgetVisible,
  type DashboardLayoutItem,
  type DashboardWidgetDefinition,
  type DashboardWidgetId,
} from "./dashboardLayout";
import "./DashboardMvp.css";
import { getMapFocusForStream } from "./mapFocus";
import { type StreamDeviceOption } from "./streamDevices";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  getDashboardStreamStatusText,
  getDashboardStreamDisplayName,
  type DashboardGeometrySource,
  type DashboardStreamSlot,
} from "./streamTypes";
import type { RealtimePlayerSnapshot } from "../streaming/types";
import { useDashboardStreams } from "./hooks/useDashboardStreams";

const TacticalLeafletMap = lazy(() =>
  import("./map/TacticalLeafletMap").then((module) => ({ default: module.TacticalLeafletMap })),
);
const EventLogView = lazy(() =>
  import("./components/EventLogView").then((module) => ({ default: module.EventLogView })),
);
const TimeSyncSettingsView = lazy(() =>
  import("./components/TimeSyncSettingsView").then((module) => ({ default: module.TimeSyncSettingsView })),
);

type TelemetryRow = [label: string, value: string];
type DashboardView = "dashboard" | "cctv" | "events" | "status" | "settings";
type CctvLayoutMode = "3x3" | "4x4" | "5x5" | "auto";
type CctvQualityMode = "preview" | "high";

interface AudioAnalysisSnapshot {
  streamId: string;
  title: string;
  mode: RealtimePlayerSnapshot["mode"];
  streamStatus: RealtimePlayerSnapshot["streamStatus"];
  hasAudioTrack: boolean;
  isAudioActive: boolean;
  audioLevel: number | null;
  firstFrameLatencyMs: number | null;
  whepResponseMs: number | null;
  jitterMs: number | null;
  packetsLost: number | null;
}

type StatusTone = "good" | "warning" | "danger" | "muted" | "info";

interface StatusNote {
  label: string;
  tone: StatusTone;
}

interface StatusTile extends StatusNote {
  value: string;
}

function geometrySourceLabel(source: DashboardGeometrySource | undefined): string {
  switch (source) {
    case "telemetry":
      return "GPS 텔레메트리";
    case "registry":
      return "장비 등록값";
    case "device":
      return "장비 좌표";
    case "mock":
    default:
      return "기본 좌표";
  }
}

function telemetryRowsForStream(stream: DashboardStreamSlot): TelemetryRow[] {
  const geometry = stream.geometry;
  const streamName = getDashboardStreamDisplayName(stream);
  if (!geometry) {
    return [
      ["스트림", streamName],
      ["상태", getDashboardStreamStatusText(stream.status)],
      ["좌표", "대기"],
      ["고도", "대기"],
      ["방위", "대기"],
      ["좌표소스", "없음"],
    ];
  }

  return [
    ["스트림", streamName],
    ["상태", getDashboardStreamStatusText(stream.status)],
    ["위도", geometry.lat.toFixed(6)],
    ["경도", geometry.lng.toFixed(6)],
    ["고도", `${geometry.altitudeM.toFixed(1)} m`],
    ["기체 방위", formatBearing(geometry.headingDeg)],
    ["지도 기준", formatBearing(geometry.yawDeg)],
    ["방위 차이", formatBearingDelta(geometry.headingDeg, geometry.yawDeg)],
    ["피치 / 롤", `${formatSignedDegree(geometry.pitchDeg)} / ${formatSignedDegree(geometry.rollDeg)}`],
    ["FOV", `${geometry.fovDeg}deg`],
    ["좌표소스", geometrySourceLabel(geometry.source)],
  ];
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function formatBearing(value: number): string {
  return `${Math.round(normalizeDegrees(value)).toString().padStart(3, "0")}deg`;
}

function formatSignedDegree(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}deg`;
}

function formatBearingDelta(headingDeg: number, mapBearingDeg: number): string {
  const delta = ((headingDeg - mapBearingDeg + 540) % 360) - 180;
  return formatSignedDegree(delta);
}

export function DashboardMvp() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const assetTreeWidget = getDashboardWidgetDefinition("asset-tree");
  const tacticalMapWidget = getDashboardWidgetDefinition("tactical-map");
  const telemetryWidget = getDashboardWidgetDefinition("telemetry-panel");
  const opsSummaryWidget = getDashboardWidgetDefinition("ops-summary");
  const aiResultsWidget = getDashboardWidgetDefinition("ai-results");
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(() => resetDashboardLayout());
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("dashboard");
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [audioActiveStreamId, setAudioActiveStreamId] = useState<string | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisSnapshot | null>(null);
  const [cctvLayoutMode, setCctvLayoutMode] = useState<CctvLayoutMode>("4x4");
  const [cctvQualityMode, setCctvQualityMode] = useState<CctvQualityMode>("preview");
  const [talkbackTargetStreamIds, setTalkbackTargetStreamIds] = useState<string[]>([]);
  const [popoutWidgetId, setPopoutWidgetId] = useState<DashboardWidgetId | null>(null);
  const [layoutMessage, setLayoutMessage] = useState("기본 레이아웃");
  const handleAuthFailure = useCallback((): void => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
  const {
    connectStreamDevice: connectStreamDeviceState,
    disconnectCurrentStreamSlot: disconnectCurrentStreamSlotState,
    editingStream,
    openStreamConnection: openStreamConnectionState,
    selectedStream,
    selectedStreamId,
    setEditingStreamId,
    streamDevices,
    streams,
    toggleStreamAiMode: toggleStreamAiModeState,
  } = useDashboardStreams(handleAuthFailure);
  const mapFocus = useMemo(() => getMapFocusForStream(selectedStream), [selectedStream]);
  const telemetryRows = useMemo(() => telemetryRowsForStream(selectedStream), [selectedStream]);
  const assetTreeRoot = useMemo(() => mergeAssetTreeWithStreams(DEFAULT_ASSET_TREE, streams), [streams]);
  const cctvGridSize = getCctvGridSize(cctvLayoutMode);
  const cctvStreams = useMemo(() => buildCctvGridStreams(streams, cctvGridSize), [streams, cctvGridSize]);

  const isWidgetPinned = useCallback(
    (widgetId: DashboardWidgetId): boolean => layout.find((item) => item.id === widgetId)?.pinned ?? false,
    [layout],
  );
  const isWidgetVisible = useCallback(
    (widgetId: DashboardWidgetId): boolean => layout.find((item) => item.id === widgetId)?.visible ?? false,
    [layout],
  );

  const panelClass = useCallback(
    (baseClass: string, widgetId: DashboardWidgetId): string => `${baseClass} ${isWidgetPinned(widgetId) ? "is-pinned" : ""}`,
    [isWidgetPinned],
  );

  const toggleWidgetPin = useCallback((widgetId: DashboardWidgetId): void => {
    const nextPinned = !isWidgetPinned(widgetId);
    setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
    setLayoutMessage(nextPinned ? "위젯 고정됨" : "위젯 고정 해제됨");
  }, [isWidgetPinned]);

  const setWidgetVisible = useCallback((widgetId: DashboardWidgetId, visible: boolean): void => {
    setLayout((current) => setDashboardWidgetVisible(current, widgetId, visible));
    setLayoutMessage(visible ? "위젯 표시됨" : "위젯 숨김");
  }, []);

  const resetLayout = useCallback((): void => {
    setLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
    setLayoutMessage("기본 레이아웃으로 초기화됨");
  }, []);

  const handleLogout = useCallback((): void => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const widgetControls = (widgetId: DashboardWidgetId, title: string) => (
    <WidgetHeaderActions
      isPinned={isWidgetPinned(widgetId)}
      onPopOut={setPopoutWidgetId}
      onHide={(id) => setWidgetVisible(id, false)}
      onTogglePin={toggleWidgetPin}
      title={title}
      widgetId={widgetId}
    />
  );

  const openStreamConnection = useCallback((streamId: string): void => {
    openStreamConnectionState(streamId);
    setLayoutMessage("스트림 슬롯 선택됨");
  }, [openStreamConnectionState]);

  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    connectStreamDeviceState(device);
    setLayoutMessage("스트리밍 장비 연결됨");
  }, [connectStreamDeviceState]);

  const disconnectCurrentStreamSlot = useCallback((): void => {
    disconnectCurrentStreamSlotState();
    setLayoutMessage("스트리밍 장비 연결 해제됨");
  }, [disconnectCurrentStreamSlotState]);

  const toggleStreamAiMode = useCallback((streamId: string): void => {
    toggleStreamAiModeState(streamId);
    setLayoutMessage("AI 모드 옵션 변경됨");
  }, [toggleStreamAiModeState]);

  const handleSelectedPlaybackStatusChange = useCallback(
    (streamId: string, snapshot: RealtimePlayerSnapshot): void => {
      const sourceStream = streams.find((stream) => stream.id === streamId);
      const nextAnalysis: AudioAnalysisSnapshot = {
        streamId,
        title: sourceStream?.title ?? streamId,
        mode: snapshot.mode,
        streamStatus: snapshot.streamStatus,
        hasAudioTrack: Boolean(snapshot.hasAudioTrack),
        isAudioActive: Boolean(snapshot.isAudioActive),
        audioLevel: snapshot.audioLevel ?? null,
        firstFrameLatencyMs: snapshot.webrtcFirstFrameLatencyMs ?? null,
        whepResponseMs: snapshot.webrtcWhepResponseMs ?? null,
        jitterMs: snapshot.audioJitterMs ?? null,
        packetsLost: snapshot.audioPacketsLost ?? null,
      };
      setAudioAnalysis((current) => {
        if (
          current?.streamId === nextAnalysis.streamId &&
          current.title === nextAnalysis.title &&
          current.mode === nextAnalysis.mode &&
          current.streamStatus === nextAnalysis.streamStatus &&
          current.hasAudioTrack === nextAnalysis.hasAudioTrack &&
          current.isAudioActive === nextAnalysis.isAudioActive &&
          current.audioLevel === nextAnalysis.audioLevel &&
          current.firstFrameLatencyMs === nextAnalysis.firstFrameLatencyMs &&
          current.whepResponseMs === nextAnalysis.whepResponseMs &&
          current.jitterMs === nextAnalysis.jitterMs &&
          current.packetsLost === nextAnalysis.packetsLost
        ) {
          return current;
        }
        return nextAnalysis;
      });
      setAudioActiveStreamId((currentStreamId) => {
        if (snapshot.isAudioActive) return streamId;
        return currentStreamId === streamId ? null : currentStreamId;
      });
    },
    [streams],
  );

  const toggleTalkbackTarget = useCallback((streamPath: string): void => {
    setTalkbackTargetStreamIds((current) =>
      current.includes(streamPath)
        ? current.filter((targetStreamPath) => targetStreamPath !== streamPath)
        : [...current, streamPath],
    );
    setLayoutMessage("Talkback 대상 변경됨");
  }, []);

  return (
    <main className="ops-dashboard" aria-label="Field Ops Dashboard MVP">
      <header className="ops-dashboard__tabs" aria-label="주요 탭">
        <nav className="ops-dashboard__tab-list">
          <button
            className={`ops-tab ${activeView === "dashboard" ? "is-active" : ""}`}
            onClick={() => setActiveView("dashboard")}
            type="button"
          >
            대시보드
          </button>
          <button
            className={`ops-tab ${activeView === "cctv" ? "is-active" : ""}`}
            onClick={() => setActiveView("cctv")}
            type="button"
          >
            CCTV
          </button>
          <button
            className={`ops-tab ${activeView === "events" ? "is-active" : ""}`}
            onClick={() => setActiveView("events")}
            type="button"
          >
            이벤트로그
          </button>
          <button
            className={`ops-tab ${activeView === "status" ? "is-active" : ""}`}
            onClick={() => setActiveView("status")}
            type="button"
          >
            서버상태
          </button>
          <button
            className={`ops-tab ${activeView === "settings" ? "is-active" : ""}`}
            onClick={() => setActiveView("settings")}
            type="button"
          >
            운영설정
          </button>
        </nav>
        <div className="ops-dashboard__actions">
          <button
            aria-controls="asset-tree-drawer"
            aria-expanded={isAssetDrawerOpen}
            className="ops-command-button asset-menu-button"
            onClick={() => setIsAssetDrawerOpen(true)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            자산
          </button>
          <span role="status">{layoutMessage}</span>
          <TalkbackControlPanel selectedStreamIds={talkbackTargetStreamIds} streams={streams} />
          {currentUser ? <span className="ops-user-chip">{currentUser.username}</span> : null}
          <a className="ops-command-button is-primary" href="/publisher" role="button">
            웹캠 송출
          </a>
          <button className="ops-command-button" onClick={handleLogout} type="button">
            로그아웃
          </button>
          <button className="ops-command-button" onClick={() => setIsWidgetDialogOpen(true)} type="button">
            위젯 추가
          </button>
          <button className="ops-command-button" onClick={resetLayout} type="button">
            초기화
          </button>
        </div>
      </header>

      {activeView === "events" ? (
        <Suspense fallback={<section className="event-log-view" role="status">이벤트로그 준비 중</section>}>
          <EventLogView />
        </Suspense>
      ) : null}
      {activeView === "settings" ? (
        <Suspense fallback={<section className="time-sync-view" role="status">운영설정 준비 중</section>}>
          <TimeSyncSettingsView />
        </Suspense>
      ) : null}
      {activeView === "status" ? (
        <section className="server-status-view" aria-label="서버 상태">
          <SystemStatusPanel onAuthFailure={handleAuthFailure} variant="page" />
        </section>
      ) : null}
      {activeView === "cctv" ? (
        <section className="ops-dashboard__placeholder-view cctv-view" aria-label="CCTV">
          <div className="cctv-view__header">
            <div>
              <h2>통합 CCTV 월</h2>
              <span>{cctvGridSize * cctvGridSize}채널 감시 레이아웃 · {cctvQualityMode === "preview" ? "저화질 Preview" : "고화질 확인"}</span>
            </div>
            <div className="cctv-view__controls" aria-label="CCTV 보기 설정">
              {(["3x3", "4x4", "5x5", "auto"] as CctvLayoutMode[]).map((mode) => (
                <button
                  aria-pressed={cctvLayoutMode === mode}
                  className={cctvLayoutMode === mode ? "is-active" : ""}
                  key={mode}
                  onClick={() => setCctvLayoutMode(mode)}
                  type="button"
                >
                  {mode === "auto" ? "Auto" : mode}
                </button>
              ))}
              {(["preview", "high"] as CctvQualityMode[]).map((mode) => (
                <button
                  aria-pressed={cctvQualityMode === mode}
                  className={cctvQualityMode === mode ? "is-active" : ""}
                  key={mode}
                  onClick={() => setCctvQualityMode(mode)}
                  type="button"
                >
                  {mode === "preview" ? "저화질" : "고화질"}
                </button>
              ))}
            </div>
          </div>
          <StreamGrid
            audioActiveStreamId={audioActiveStreamId}
            className={`stream-grid--cctv is-${cctvGridSize}x${cctvGridSize} is-${cctvQualityMode}`}
            onSelectStream={openStreamConnection}
            onToggleTalkbackTarget={toggleTalkbackTarget}
            selectedStreamId={selectedStreamId}
            talkbackTargetStreamIds={talkbackTargetStreamIds}
            streams={cctvStreams}
          />
        </section>
      ) : null}
      {activeView === "dashboard" ? <section className="ops-dashboard__grid">
        {isWidgetVisible("tactical-map") ? <section
          aria-labelledby="map-title"
          className={panelClass("ops-panel tactical-map", "tactical-map")}
          data-widget-id={tacticalMapWidget.id}
          style={{ minHeight: tacticalMapWidget.minHeight, minWidth: tacticalMapWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="map-title">지도</h2>
            <span className="ops-panel__header-actions">
              <span className="ops-badge">500 m</span>
              {widgetControls("tactical-map", "지도")}
            </span>
          </div>
          <Suspense
            fallback={
              <div className="tactical-map__canvas tactical-map__canvas--loading" role="status" aria-label="지도 준비 중">
                <span />
              </div>
            }
          >
            <TacticalLeafletMap selectedStream={selectedStream} streams={streams} />
          </Suspense>
          <span className="map-focus__label" data-testid="map-focus-label">
            {mapFocus.label}
          </span>
        </section> : null}

        {isWidgetVisible("selected-stream") ? <SelectedStreamPanel
          controls={widgetControls("selected-stream", "선택 스트림")}
          hasAudioActivity={selectedStream.id === audioActiveStreamId}
          isPinned={isWidgetPinned("selected-stream")}
          onPlaybackStatusChange={handleSelectedPlaybackStatusChange}
          onToggleAiMode={toggleStreamAiMode}
          stream={selectedStream}
        /> : null}

        {isWidgetVisible("stream-grid") ? <StreamGrid
          audioActiveStreamId={audioActiveStreamId}
          onSelectStream={openStreamConnection}
          onToggleTalkbackTarget={toggleTalkbackTarget}
          selectedStreamId={selectedStreamId}
          talkbackTargetStreamIds={talkbackTargetStreamIds}
          streams={streams}
        /> : null}

        {isWidgetVisible("ops-summary") ? <OpsSummaryPanel
          audioAnalysis={audioAnalysis}
          controls={widgetControls("ops-summary", "운용 요약")}
          selectedStream={selectedStream}
          streamCount={streams.length}
          talkbackTargetCount={talkbackTargetStreamIds.length}
          widget={opsSummaryWidget}
        /> : null}

        {isWidgetVisible("telemetry-panel") ? <TelemetryPanel
          controls={widgetControls("telemetry-panel", "지오메트리 / 텔레메트리")}
          isPinned={isWidgetPinned("telemetry-panel")}
          rows={telemetryRows}
          stream={selectedStream}
          widget={telemetryWidget}
        /> : null}

        <AudioWaveformPanel analysis={audioAnalysis} selectedStream={selectedStream} />

        {isWidgetVisible("ai-results") ? <section
          aria-labelledby="ai-title"
          className={panelClass("ops-panel ai-panel", "ai-results")}
          data-widget-id={aiResultsWidget.id}
          style={{ minHeight: aiResultsWidget.minHeight, minWidth: aiResultsWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="ai-title">AI 결과</h2>
            <span className="ops-panel__header-actions">
              <span className="ops-badge is-warning">대기</span>
              {widgetControls("ai-results", "AI 결과")}
            </span>
          </div>
          <ul>
            <li>
              <strong>탐지</strong>
              <span>person / 0.72</span>
            </li>
            <li>
              <strong>위험도</strong>
              <span>중간</span>
            </li>
            <li>
              <strong>처리 지연</strong>
              <span>42 ms</span>
            </li>
          </ul>
        </section> : null}
      </section> : null}

      {activeView === "dashboard" && isWidgetVisible("asset-tree") && isAssetDrawerOpen ? (
        <div className="asset-drawer__backdrop" onClick={() => setIsAssetDrawerOpen(false)}>
          <aside
            aria-labelledby="asset-tree-title"
            className={panelClass("ops-panel asset-tree asset-drawer", "asset-tree")}
            data-widget-id={assetTreeWidget.id}
            id="asset-tree-drawer"
            onClick={(event) => event.stopPropagation()}
            style={{ minHeight: assetTreeWidget.minHeight, minWidth: assetTreeWidget.minWidth }}
          >
            <AssetTreePanel
              controls={
                <>
                  <button className="widget-icon-button" onClick={() => setIsAssetDrawerOpen(false)} title="자산트리 닫기" type="button">
                    닫기
                  </button>
                  {widgetControls("asset-tree", "자산트리")}
                </>
              }
              root={assetTreeRoot}
            />
          </aside>
        </div>
      ) : null}

      {isWidgetDialogOpen ? (
        <WidgetAddDialog
          layout={layout}
          onApply={() => {
            setIsWidgetDialogOpen(false);
            setLayoutMessage("레이아웃 변경 적용됨");
          }}
          onCancel={() => {
            setIsWidgetDialogOpen(false);
            setLayoutMessage("레이아웃 변경 취소됨");
          }}
          onReset={resetLayout}
          onToggleWidget={setWidgetVisible}
        />
      ) : null}

      {popoutWidgetId ? (
        <WidgetPopout
          onClose={() => setPopoutWidgetId(null)}
          widget={getDashboardWidgetDefinition(popoutWidgetId)}
        />
      ) : null}

      {editingStream ? (
        <StreamDeviceConnectDialog
          devices={streamDevices}
          onCancel={() => {
            setEditingStreamId(null);
            setLayoutMessage("스트림 연결 변경 취소됨");
          }}
          onConnect={connectStreamDevice}
          onDisconnect={disconnectCurrentStreamSlot}
          stream={editingStream}
        />
      ) : null}
    </main>
  );
}

function AudioWaveformPanel({
  analysis,
  selectedStream,
}: {
  analysis: AudioAnalysisSnapshot | null;
  selectedStream: DashboardStreamSlot;
}) {
  const isSelectedAnalysis = analysis?.streamId === selectedStream.id;
  const isActive = Boolean(isSelectedAnalysis && analysis?.isAudioActive);
  const hasTrack = Boolean(isSelectedAnalysis && analysis?.hasAudioTrack);
  const audioLevel = isSelectedAnalysis ? analysis?.audioLevel ?? null : null;
  const bars = useMemo(() => buildAudioWaveformBars(audioLevel, isActive), [audioLevel, isActive]);
  const sourceName = isSelectedAnalysis ? analysis?.title : selectedStream.title;
  const modeText = isSelectedAnalysis ? formatPlaybackMode(analysis?.mode ?? null, selectedStream.status) : "대기";
  const latencyText = isSelectedAnalysis && analysis?.firstFrameLatencyMs !== null ? `${analysis?.firstFrameLatencyMs} ms` : "대기";
  const jitterText = isSelectedAnalysis && analysis?.jitterMs !== null ? `${analysis?.jitterMs} ms` : "대기";
  const lostText = isSelectedAnalysis && analysis?.packetsLost !== null ? String(analysis?.packetsLost) : "0";
  const levelText = audioLevel !== null ? `${Math.round(audioLevel * 100)}%` : "대기";
  const latencyTone = getLatencyTone(analysis?.firstFrameLatencyMs ?? null);
  const jitterTone = getJitterTone(analysis?.jitterMs ?? null);
  const lossTone = getPacketLossTone(analysis?.packetsLost ?? null);

  return (
    <section aria-labelledby="audio-waveform-title" className={`ops-panel audio-waveform ${isActive ? "has-audio" : ""}`}>
      <div className="ops-panel__header">
        <h2 id="audio-waveform-title">음성 파형 분석</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${isActive ? "is-online" : hasTrack ? "is-warning" : "is-offline"}`}>
            {isActive ? "수신 중" : hasTrack ? "음성 대기" : "신호 대기"}
          </span>
        </span>
      </div>
      <div className="audio-waveform__body">
        <div className="audio-waveform__caption">
          <span>선택 스트림 품질</span>
          <strong>{modeText}</strong>
        </div>
        <div className="audio-waveform__scope" aria-label="수신 음성 파형">
          {bars.map((height, index) => (
            <span key={`${selectedStream.id}-${index}`} style={{ "--bar-height": `${height}%` } as CSSProperties} />
          ))}
        </div>
        <dl>
          <div>
            <dt>대상</dt>
            <dd>{sourceName}</dd>
          </div>
          <div>
            <dt>레벨</dt>
            <dd>{levelText}</dd>
          </div>
          <div className={`is-${latencyTone}`}>
            <dt>지연</dt>
            <dd>{latencyText}</dd>
          </div>
          <div className={`is-${jitterTone}`}>
            <dt>지터</dt>
            <dd>{jitterText}</dd>
          </div>
          <div className={`is-${lossTone}`}>
            <dt>손실</dt>
            <dd>{lostText}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function OpsSummaryPanel({
  audioAnalysis,
  controls,
  selectedStream,
  streamCount,
  talkbackTargetCount,
  widget,
}: {
  audioAnalysis: AudioAnalysisSnapshot | null;
  controls: ReactNode;
  selectedStream: DashboardStreamSlot;
  streamCount: number;
  talkbackTargetCount: number;
  widget: DashboardWidgetDefinition;
}) {
  const gpsText = selectedStream.geometry ? "좌표 수신" : "좌표 대기";
  const audioText = audioAnalysis?.streamId === selectedStream.id && audioAnalysis.isAudioActive ? "음성 수신" : "음성 대기";
  const aiText = selectedStream.aiModeEnabled ? "AI 준비" : "AI 꺼짐";
  const selectedStatusText = getDashboardStreamStatusText(selectedStream.status);
  const statusTiles: StatusTile[] = [
    { label: "스트림", value: `${streamCount}개`, tone: "info" },
    { label: "GPS", value: gpsText, tone: selectedStream.geometry ? "good" : "muted" },
    { label: "오디오", value: audioText, tone: audioText === "음성 수신" ? "good" : "muted" },
    { label: "Talkback", value: talkbackTargetCount ? `${talkbackTargetCount} 대상` : "대기", tone: talkbackTargetCount ? "info" : "muted" },
  ];
  const statusNotes: StatusNote[] = [
    { label: selectedStream.geometry ? "GPS 정상" : "GPS 대기", tone: selectedStream.geometry ? "good" : "muted" },
    {
      label: selectedStream.status === "online" ? "WebRTC 직접 연결" : selectedStatusText,
      tone: selectedStream.status === "online" ? "good" : selectedStream.status === "offline" ? "danger" : "warning",
    },
    {
      label: audioAnalysis?.jitterMs !== null && audioAnalysis?.jitterMs !== undefined
        ? `음성 지터 ${Math.round(audioAnalysis.jitterMs)}ms`
        : "음성 분석 대기",
      tone: getJitterTone(audioAnalysis?.jitterMs ?? null),
    },
    { label: aiText, tone: selectedStream.aiModeEnabled ? "info" : "muted" },
  ];
  const recentEvents: StatusNote[] = [
    { label: `${getDashboardStreamDisplayName(selectedStream)} 선택됨`, tone: "info" },
    { label: selectedStream.geometry ? "지도 포커스 좌표 동기화" : "지도 좌표 대기", tone: selectedStream.geometry ? "good" : "muted" },
    {
      label: audioAnalysis?.streamId === selectedStream.id ? `재생 경로 ${formatPlaybackMode(audioAnalysis.mode, selectedStream.status)}` : "재생 품질 수집 대기",
      tone: audioAnalysis?.streamId === selectedStream.id ? "info" : "muted",
    },
  ];

  return (
    <section
      aria-labelledby="ops-summary-title"
      className="ops-panel ops-summary"
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="ops-summary-title">운용 요약</h2>
        {controls}
      </div>
      <div className="ops-summary__body">
        <div className="ops-summary__selected">
          <span>선택 스트림</span>
          <strong>{getDashboardStreamDisplayName(selectedStream)}</strong>
          <em className={`ops-summary__state is-${selectedStream.status}`}>{selectedStatusText}</em>
        </div>
        <dl className="ops-summary__tiles">
          {statusTiles.map((tile) => (
            <div className={`is-${tile.tone}`} key={tile.label}>
              <dt>{tile.label}</dt>
              <dd>{tile.value}</dd>
            </div>
          ))}
        </dl>
        <div className="ops-summary__notes" aria-label="주의 / 상태">
          <span>주의 / 상태</span>
          <ul>
            {statusNotes.map((note) => (
              <li className={`is-${note.tone}`} key={note.label}>{note.label}</li>
            ))}
          </ul>
        </div>
        <div className="ops-summary__events" aria-label="최근 상태">
          <span>최근 상태</span>
          <ul>
            {recentEvents.map((event) => (
              <li className={`is-${event.tone}`} key={event.label}>{event.label}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TelemetryPanel({
  controls,
  isPinned,
  rows,
  stream,
  widget,
}: {
  controls: ReactNode;
  isPinned: boolean;
  rows: TelemetryRow[];
  stream: DashboardStreamSlot;
  widget: DashboardWidgetDefinition;
}) {
  const geometry = stream.geometry;
  const streamName = getDashboardStreamDisplayName(stream);
  const heading = geometry ? formatBearing(geometry.headingDeg) : "대기";
  const mapBearing = geometry ? formatBearing(geometry.yawDeg) : "대기";
  const bearingDelta = geometry ? formatBearingDelta(geometry.headingDeg, geometry.yawDeg) : "대기";
  const headingRotation = geometry ? `rotate(${normalizeDegrees(geometry.headingDeg)}deg)` : undefined;
  const mapRotation = geometry ? `rotate(${normalizeDegrees(geometry.yawDeg)}deg)` : undefined;
  const primaryMetrics: TelemetryRow[] = [
    ["고도", geometry ? `${geometry.altitudeM.toFixed(1)} m` : "대기"],
    ["기체 방위", heading],
    ["지도 기준", mapBearing],
  ];

  return (
    <section
      aria-labelledby="telemetry-title"
      className={`ops-panel telemetry-panel ${isPinned ? "is-pinned" : ""}`}
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="telemetry-title">지오메트리 / 텔레메트리</h2>
        {controls}
      </div>
      <div className="telemetry-panel__body">
        <div className="telemetry-panel__identity">
          <span>선택 스트림</span>
          <strong>{streamName}</strong>
          <em className={`ops-summary__state is-${stream.status}`}>{getDashboardStreamStatusText(stream.status)}</em>
        </div>
        <div className="telemetry-compass" aria-label="기체 방위와 지도 기준 방위">
          <div className="telemetry-compass__dial">
            <span className="telemetry-compass__north">N</span>
            <span className="telemetry-compass__needle" style={{ transform: headingRotation }} />
            <span className="telemetry-compass__map-bearing" style={{ transform: mapRotation }} />
          </div>
          <div className="telemetry-compass__legend">
            <span>기체 {heading}</span>
            <span>지도 {mapBearing}</span>
            <strong>차이 {bearingDelta}</strong>
          </div>
        </div>
        <dl className="telemetry-panel__metrics">
          {primaryMetrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="telemetry-panel__details">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function buildAudioWaveformBars(audioLevel: number | null, isActive: boolean): number[] {
  if (!isActive || audioLevel === null) {
    return Array.from({ length: 28 }, () => 4);
  }
  const normalizedLevel = Math.min(1, Math.max(0, audioLevel));
  const baseHeight = 12 + normalizedLevel * 76;
  return Array.from({ length: 28 }, (_, index) => {
    const phase = Math.sin(index * 0.86) * 0.26 + Math.cos(index * 0.43) * 0.18;
    return Math.max(6, Math.min(94, baseHeight * (0.72 + phase)));
  });
}

function formatPlaybackMode(mode: RealtimePlayerSnapshot["mode"] | null, streamStatus: DashboardStreamSlot["status"]): string {
  if (mode === "webrtc") return "WebRTC";
  if (mode === "hls") return "HLS fallback";
  if (mode === "reconnecting") return "재연결";
  if (mode === "loading") return "연결 확인";
  if (mode === "error") return "경로 오류";
  if (mode === "offline" || streamStatus === "offline") return "오프라인";
  return "대기";
}

function getLatencyTone(value: number | null): StatusTone {
  if (value === null) return "muted";
  if (value <= 450) return "good";
  if (value <= 900) return "warning";
  return "danger";
}

function getJitterTone(value: number | null): StatusTone {
  if (value === null) return "muted";
  if (value <= 30) return "good";
  if (value <= 80) return "warning";
  return "danger";
}

function getPacketLossTone(value: number | null): StatusTone {
  if (value === null) return "muted";
  if (value <= 0) return "good";
  if (value <= 3) return "warning";
  return "danger";
}

function getCctvGridSize(mode: CctvLayoutMode): number {
  if (mode === "3x3") return 3;
  if (mode === "5x5") return 5;
  return 4;
}

function buildCctvGridStreams(streams: DashboardStreamSlot[], gridSize: number): DashboardStreamSlot[] {
  const positionedCctvStreams = new Map<number, DashboardStreamSlot>();
  const regularStreams: DashboardStreamSlot[] = [];
  for (const stream of streams) {
    const cctvChannelNumber = parseCctvChannelNumber(stream.id);
    if (cctvChannelNumber) {
      positionedCctvStreams.set(cctvChannelNumber, stream);
      continue;
    }
    regularStreams.push(stream);
  }

  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const channelNumber = index + 1;
    const positionedStream = positionedCctvStreams.get(channelNumber);
    if (positionedStream) return positionedStream;
    return regularStreams[index] ?? createEmptyCctvStreamSlot(channelNumber);
  });
}

function parseCctvChannelNumber(streamId: string): number | null {
  if (!streamId.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return null;
  const channelNumber = Number(streamId.replace(CCTV_EMPTY_STREAM_ID_PREFIX, ""));
  return Number.isInteger(channelNumber) && channelNumber > 0 ? channelNumber : null;
}
