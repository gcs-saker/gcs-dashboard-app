import { lazy, Suspense, useCallback, useMemo, useState } from "react";
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
import { DEFAULT_ASSET_TREE, mergeAssetTreeWithStreams } from "./assetTree";
import {
  getDashboardWidgetDefinition,
  resetDashboardLayout,
  setDashboardWidgetPinned,
  setDashboardWidgetVisible,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "./dashboardLayout";
import "./DashboardMvp.css";
import { getMapFocusForStream } from "./mapFocus";
import { type StreamDeviceOption } from "./streamDevices";
import {
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
type DashboardView = "dashboard" | "cctv" | "events" | "settings";

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
    ["자세", `H ${geometry.headingDeg}deg / P ${geometry.pitchDeg}deg`],
    ["FOV", `${geometry.fovDeg}deg`],
    ["좌표소스", geometrySourceLabel(geometry.source)],
  ];
}

export function DashboardMvp() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const assetTreeWidget = getDashboardWidgetDefinition("asset-tree");
  const tacticalMapWidget = getDashboardWidgetDefinition("tactical-map");
  const systemStatusWidget = getDashboardWidgetDefinition("system-status");
  const telemetryWidget = getDashboardWidgetDefinition("telemetry-panel");
  const aiResultsWidget = getDashboardWidgetDefinition("ai-results");
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(() => resetDashboardLayout());
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("dashboard");
  const [audioActiveStreamId, setAudioActiveStreamId] = useState<string | null>(null);
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

  const isWidgetPinned = (widgetId: DashboardWidgetId): boolean =>
    layout.find((item) => item.id === widgetId)?.pinned ?? false;
  const isWidgetVisible = (widgetId: DashboardWidgetId): boolean =>
    layout.find((item) => item.id === widgetId)?.visible ?? false;

  const panelClass = (baseClass: string, widgetId: DashboardWidgetId): string =>
    `${baseClass} ${isWidgetPinned(widgetId) ? "is-pinned" : ""}`;

  const toggleWidgetPin = (widgetId: DashboardWidgetId): void => {
    const nextPinned = !isWidgetPinned(widgetId);
    setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
    setLayoutMessage(nextPinned ? "위젯 고정됨" : "위젯 고정 해제됨");
  };

  const setWidgetVisible = (widgetId: DashboardWidgetId, visible: boolean): void => {
    setLayout((current) => setDashboardWidgetVisible(current, widgetId, visible));
    setLayoutMessage(visible ? "위젯 표시됨" : "위젯 숨김");
  };

  const resetLayout = (): void => {
    setLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
    setLayoutMessage("기본 레이아웃으로 초기화됨");
  };

  const handleLogout = (): void => {
    logout();
    navigate("/login", { replace: true });
  };

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

  const openStreamConnection = (streamId: string): void => {
    openStreamConnectionState(streamId);
    setLayoutMessage("스트림 슬롯 선택됨");
  };

  const connectStreamDevice = (device: StreamDeviceOption): void => {
    connectStreamDeviceState(device);
    setLayoutMessage("스트리밍 장비 연결됨");
  };

  const disconnectCurrentStreamSlot = (): void => {
    disconnectCurrentStreamSlotState();
    setLayoutMessage("스트리밍 장비 연결 해제됨");
  };

  const toggleStreamAiMode = (streamId: string): void => {
    toggleStreamAiModeState(streamId);
    setLayoutMessage("AI 모드 옵션 변경됨");
  };

  const handleSelectedPlaybackStatusChange = useCallback(
    (streamId: string, snapshot: RealtimePlayerSnapshot): void => {
      setAudioActiveStreamId((currentStreamId) => {
        if (snapshot.isAudioActive) return streamId;
        return currentStreamId === streamId ? null : currentStreamId;
      });
    },
    [],
  );

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
            className={`ops-tab ${activeView === "settings" ? "is-active" : ""}`}
            onClick={() => setActiveView("settings")}
            type="button"
          >
            운영설정
          </button>
        </nav>
        <div className="ops-dashboard__actions">
          <span role="status">{layoutMessage}</span>
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
      {activeView === "cctv" ? (
        <section className="ops-dashboard__placeholder-view" aria-label="CCTV">
          <StreamGrid
            audioActiveStreamId={audioActiveStreamId}
            onSelectStream={openStreamConnection}
            selectedStreamId={selectedStreamId}
            streams={streams}
          />
        </section>
      ) : null}
      {activeView === "dashboard" ? <section className="ops-dashboard__grid">
        {isWidgetVisible("asset-tree") ? <aside
          aria-labelledby="asset-tree-title"
          className={panelClass("ops-panel asset-tree", "asset-tree")}
          data-widget-id={assetTreeWidget.id}
          style={{ minHeight: assetTreeWidget.minHeight, minWidth: assetTreeWidget.minWidth }}
        >
          <AssetTreePanel controls={widgetControls("asset-tree", "자산트리")} root={assetTreeRoot} />
        </aside> : null}

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
          selectedStreamId={selectedStreamId}
          streams={streams}
        /> : null}

        {isWidgetVisible("system-status") ? <section
          aria-labelledby="status-title"
          className={panelClass("ops-panel system-status", "system-status")}
          data-widget-id={systemStatusWidget.id}
          style={{ minHeight: systemStatusWidget.minHeight, minWidth: systemStatusWidget.minWidth }}
        >
          <SystemStatusPanel
            controls={widgetControls("system-status", "서버 상태 상세 / 연결상태 / 헬스체크")}
            onAuthFailure={handleAuthFailure}
          />
        </section> : null}

        {isWidgetVisible("telemetry-panel") ? <section
          aria-labelledby="telemetry-title"
          className={panelClass("ops-panel telemetry-panel", "telemetry-panel")}
          data-widget-id={telemetryWidget.id}
          style={{ minHeight: telemetryWidget.minHeight, minWidth: telemetryWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="telemetry-title">지오메트리 / 텔레메트리</h2>
            {widgetControls("telemetry-panel", "지오메트리 / 텔레메트리")}
          </div>
          <div className="telemetry-panel__body">
            <div className="telemetry-orbit">
              <span />
              <span />
              <span />
            </div>
            <dl>
              {telemetryRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section> : null}

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
