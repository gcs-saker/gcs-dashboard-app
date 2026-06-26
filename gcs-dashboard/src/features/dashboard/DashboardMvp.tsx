import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AudioWaveformPanel } from "./components/AudioWaveformPanel";
import { CctvChannelCard, type CctvQualityMode } from "./components/CctvChannelCard";
import { OpsSummaryPanel } from "./components/OpsSummaryPanel";
import { SelectedStreamPanel } from "./components/SelectedStreamPanel";
import { StreamGrid } from "./components/StreamGrid";
import { TelemetryPanel } from "./components/TelemetryPanel";
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
  type DashboardWidgetDefinition,
  type DashboardWidgetId,
} from "./dashboardLayout";
import "./DashboardMvp.scss";
import { getMapFocusForStream } from "./mapFocus";
import { type StreamDeviceOption } from "./streamDevices";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  type DashboardStreamSlot,
} from "./streamTypes";
import type { RealtimePlayerSnapshot } from "../streaming/types";
import { useDashboardStreams } from "./hooks/useDashboardStreams";
import { useDashboardUserPreferences } from "./hooks/useDashboardUserPreferences";
import { telemetryRowsForStream, type AudioAnalysisSnapshot } from "./dashboardPresentation";
import { DASHBOARD_STREAM_STATUS } from "../stateContracts";
import type { CctvLayoutMode } from "./userPreferences";
import { isMotionEnabled } from "./motionPreference";

const loadTacticalLeafletMap = () => import("./map/TacticalLeafletMap");
const loadEventLogView = () => import("./components/EventLogView");
const loadTimeSyncSettingsView = () => import("./components/TimeSyncSettingsView");

const TacticalLeafletMap = lazy(() => loadTacticalLeafletMap().then((module) => ({ default: module.TacticalLeafletMap })));
const EventLogView = lazy(() => loadEventLogView().then((module) => ({ default: module.EventLogView })));
const TimeSyncSettingsView = lazy(() => loadTimeSyncSettingsView().then((module) => ({ default: module.TimeSyncSettingsView })));

interface StreamAvailabilityNotification {
  id: string;
  message: string;
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
  const {
    isWidgetPinned,
    isWidgetVisible,
    preferences,
    resetWidgetLayout,
    setActiveView,
    setCctvLayoutMode,
    setCctvQualityMode,
    setLayout,
    setMotionMode,
    setStreamAlias,
  } = useDashboardUserPreferences(currentUser?.username);
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);
  const [isAssetDrawerOpen, setIsAssetDrawerOpen] = useState(false);
  const [audioActiveStreamId, setAudioActiveStreamId] = useState<string | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisSnapshot | null>(null);
  const [talkbackTargetStreamIds, setTalkbackTargetStreamIds] = useState<string[]>([]);
  const [popoutWidgetId, setPopoutWidgetId] = useState<DashboardWidgetId | null>(null);
  const [layoutMessage, setLayoutMessage] = useState("기본 레이아웃");
  const [streamNotification, setStreamNotification] = useState<StreamAvailabilityNotification | null>(null);
  const knownAvailableStreamIdsRef = useRef<Set<string> | null>(null);
  const handleAuthFailure = useCallback((): void => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
  const {
    connectManualStreamAddress,
    connectStreamDevice: connectStreamDeviceState,
    disconnectCurrentStreamSlot: disconnectCurrentStreamSlotState,
    editingStream,
    openStreamConnection: openStreamConnectionState,
    selectStream: selectStreamState,
    selectedStream,
    selectedStreamId,
    setEditingStreamId,
    streamDevices,
    streams,
    toggleStreamAiMode: toggleStreamAiModeState,
  } = useDashboardStreams({
    onAuthFailure: handleAuthFailure,
    onStreamDeviceAliasChange: setStreamAlias,
    streamPreferences: preferences.streamPreferences,
  });
  const { activeView, cctvLayoutMode, cctvQualityMode, layout, motionMode } = preferences;
  const motionEnabled = isMotionEnabled(motionMode);
  const mapFocus = useMemo(() => getMapFocusForStream(selectedStream), [selectedStream]);
  const telemetryRows = useMemo(() => telemetryRowsForStream(selectedStream), [selectedStream]);
  const assetTreeRoot = useMemo(() => mergeAssetTreeWithStreams(DEFAULT_ASSET_TREE, streams), [streams]);
  const cctvGridSize = getCctvGridSize(cctvLayoutMode);
  const cctvStreams = useMemo(() => buildCctvGridStreams(streams, cctvGridSize), [streams, cctvGridSize]);
  const cctvStatusSummary = useMemo(
    () => ({
      fallback: streams.filter((stream) => stream.status === "fallback").length,
      offline: streams.filter((stream) => stream.status === "offline").length,
      online: streams.filter((stream) => stream.status === "online").length,
    }),
    [streams],
  );

  useEffect(() => {
    const availableStreams = streams.filter(isReceivableStream);
    const availableStreamIds = new Set(availableStreams.map((stream) => stream.id));
    if (!knownAvailableStreamIdsRef.current) {
      knownAvailableStreamIdsRef.current = availableStreamIds;
      return;
    }

    const addedStream = availableStreams.find((stream) => !knownAvailableStreamIdsRef.current?.has(stream.id));
    if (addedStream) {
      setStreamNotification({
        id: `${addedStream.id}-${Date.now()}`,
        message: `수신 가능한 스트림 감지: ${addedStream.title}`,
      });
    }
    knownAvailableStreamIdsRef.current = availableStreamIds;
  }, [streams]);

  useEffect(() => {
    if (!streamNotification) return;
    const timeoutId = globalThis.setTimeout(() => setStreamNotification(null), 4500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [streamNotification]);

  useEffect(() => {
    const preloadDashboardChunks = () => {
      void loadEventLogView();
      void loadTimeSyncSettingsView();
      void loadTacticalLeafletMap();
    };
    if (typeof window === "undefined") return;
    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadDashboardChunks, { timeout: 2600 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timeoutId = globalThis.setTimeout(preloadDashboardChunks, 1600);
    return () => globalThis.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motionMode;
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [motionMode]);

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
    resetWidgetLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
    setLayoutMessage("기본 레이아웃으로 초기화됨");
  }, [resetWidgetLayout]);

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

  const selectMapStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
    setLayoutMessage("지도 핀 스트림 선택됨");
  }, [selectStreamState]);

  const selectAssetTreeStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
    setIsAssetDrawerOpen(false);
    setLayoutMessage("자산트리 스트림 선택됨");
  }, [selectStreamState]);

  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    connectStreamDeviceState(device);
    setLayoutMessage("스트리밍 장비 연결됨");
  }, [connectStreamDeviceState]);

  const connectStreamAddress = useCallback((address: string, displayName: string): void => {
    connectManualStreamAddress(address, displayName);
    setLayoutMessage("스트리밍 주소 연결됨");
  }, [connectManualStreamAddress]);

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
        iceRoundTripTimeMs: snapshot.iceRoundTripTimeMs ?? null,
        localCandidateType: snapshot.localCandidateType ?? null,
        remoteCandidateType: snapshot.remoteCandidateType ?? null,
        iceTransportProtocol: snapshot.iceTransportProtocol ?? null,
        relayFallbackReason: snapshot.relayFallbackReason ?? null,
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
          current.packetsLost === nextAnalysis.packetsLost &&
          current.iceRoundTripTimeMs === nextAnalysis.iceRoundTripTimeMs &&
          current.localCandidateType === nextAnalysis.localCandidateType &&
          current.remoteCandidateType === nextAnalysis.remoteCandidateType &&
          current.iceTransportProtocol === nextAnalysis.iceTransportProtocol &&
          current.relayFallbackReason === nextAnalysis.relayFallbackReason
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
  const renderCctvCard = useCallback(
    (stream: DashboardStreamSlot, isSelected: boolean) => (
      <CctvChannelCard
        hasAudioActivity={stream.id === audioActiveStreamId}
        isSelected={isSelected}
        onSelect={openStreamConnection}
        qualityMode={cctvQualityMode}
        stream={stream}
      />
    ),
    [audioActiveStreamId, cctvQualityMode, openStreamConnection],
  );

  return (
    <main className="ops-dashboard" data-motion={motionMode} aria-label="Field Ops Dashboard MVP">
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
          <div className="ops-dashboard__action-group">
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
            <span className="ops-layout-status" role="status">{layoutMessage}</span>
          </div>
          <TalkbackControlPanel selectedStreamIds={talkbackTargetStreamIds} streams={streams} />
          <div className="ops-dashboard__action-group">
            <a aria-label="웹캠 송출" className="ops-command-button is-primary" href="/publisher" role="button">
              송출
            </a>
            <button aria-label="위젯 추가" className="ops-command-button" onClick={() => setIsWidgetDialogOpen(true)} type="button">
              레이아웃
            </button>
            <button className="ops-command-button" onClick={resetLayout} type="button">
              초기화
            </button>
          </div>
          <details className="ops-user-menu">
            <summary>{currentUser ? currentUser.username : "미리보기"}</summary>
            <button onClick={handleLogout} type="button">로그아웃</button>
          </details>
        </div>
      </header>

      {streamNotification ? (
        <div className="ops-toast-stack" aria-live="polite">
          <button
            className="ops-stream-toast"
            onClick={() => setStreamNotification(null)}
            type="button"
          >
            <span>STREAM</span>
            <strong>{streamNotification.message}</strong>
          </button>
        </div>
      ) : null}

      {activeView === "events" ? (
        <Suspense fallback={<section className="event-log-view" role="status">이벤트로그 준비 중</section>}>
          <EventLogView />
        </Suspense>
      ) : null}
      {activeView === "settings" ? (
        <Suspense fallback={<section className="time-sync-view" role="status">운영설정 준비 중</section>}>
          <TimeSyncSettingsView motionMode={motionMode} onMotionModeChange={setMotionMode} />
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
            <div className="cctv-view__summary" aria-label="CCTV 운영 요약">
              <span>LIVE {cctvStatusSummary.online}</span>
              <span>FALLBACK {cctvStatusSummary.fallback}</span>
              <span>OFFLINE {cctvStatusSummary.offline}</span>
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
            renderCard={renderCctvCard}
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
            <TacticalLeafletMap
              isMotionEnabled={motionEnabled}
              onSelectStream={selectMapStream}
              selectedStream={selectedStream}
              streams={streams}
            />
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

        <AudioWaveformPanel analysis={audioAnalysis} isMotionEnabled={motionEnabled} selectedStream={selectedStream} />

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
              onSelectStream={selectAssetTreeStream}
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
          onConnectAddress={connectStreamAddress}
          onConnect={connectStreamDevice}
          onDisconnect={disconnectCurrentStreamSlot}
          stream={editingStream}
        />
      ) : null}
    </main>
  );
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

function isReceivableStream(stream: DashboardStreamSlot): boolean {
  if (stream.id.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return false;
  return (
    Boolean(stream.streamPath || stream.sourceUrl) &&
    (stream.status === DASHBOARD_STREAM_STATUS.online ||
      stream.status === DASHBOARD_STREAM_STATUS.fallback ||
      stream.status === DASHBOARD_STREAM_STATUS.degraded ||
      stream.status === DASHBOARD_STREAM_STATUS.reconnecting)
  );
}
