import { useEffect, useMemo, useState } from "react";
import { SelectedStreamPanel } from "./components/SelectedStreamPanel";
import { StreamGrid } from "./components/StreamGrid";
import { WidgetAddDialog } from "./components/WidgetAddDialog";
import { WidgetHeaderActions } from "./components/WidgetHeaderActions";
import { WidgetPopout } from "./components/WidgetPopout";
import { StreamDeviceConnectDialog } from "./components/StreamDeviceConnectDialog";
import { AssetTreePanel } from "./components/AssetTreePanel";
import { SystemStatusPanel } from "./components/SystemStatusPanel";
import { DEFAULT_ASSET_TREE } from "./assetTree";
import {
  getDashboardWidgetDefinition,
  resetDashboardLayout,
  setDashboardWidgetPinned,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "./dashboardLayout";
import "./DashboardMvp.css";
import { getMapFocusForStream } from "./mapFocus";
import {
  connectDeviceToStreamSlot,
  disconnectStreamSlot,
  fetchStreamDeviceOptions,
  mergeStreamSlotsWithDevices,
  MOCK_STREAM_DEVICES,
  type StreamDeviceOption,
} from "./streamDevices";
import { DEFAULT_DASHBOARD_STREAMS } from "./streamTypes";

const telemetryRows = [
  ["위도", "37.123456"],
  ["경도", "127.123456"],
  ["고도", "120 m AGL"],
  ["속도", "36 km/h"],
  ["배터리", "78%"],
  ["링크", "95% / 42 ms"],
];

export function DashboardMvp() {
  const assetTreeWidget = getDashboardWidgetDefinition("asset-tree");
  const tacticalMapWidget = getDashboardWidgetDefinition("tactical-map");
  const systemStatusWidget = getDashboardWidgetDefinition("system-status");
  const telemetryWidget = getDashboardWidgetDefinition("telemetry-panel");
  const aiResultsWidget = getDashboardWidgetDefinition("ai-results");
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(() => resetDashboardLayout());
  const [isWidgetDialogOpen, setIsWidgetDialogOpen] = useState(false);
  const [popoutWidgetId, setPopoutWidgetId] = useState<DashboardWidgetId | null>(null);
  const [layoutMessage, setLayoutMessage] = useState("기본 레이아웃");
  const [streams, setStreams] = useState(() => DEFAULT_DASHBOARD_STREAMS);
  const [streamDevices, setStreamDevices] = useState<StreamDeviceOption[]>(MOCK_STREAM_DEVICES);
  const [selectedStreamId, setSelectedStreamId] = useState(DEFAULT_DASHBOARD_STREAMS[0].id);
  const [editingStreamId, setEditingStreamId] = useState<string | null>(null);
  const selectedStream = useMemo(
    () => streams.find((stream) => stream.id === selectedStreamId) ?? streams[0],
    [selectedStreamId, streams],
  );
  const editingStream = useMemo(
    () => streams.find((stream) => stream.id === editingStreamId) ?? null,
    [editingStreamId, streams],
  );
  const mapFocus = useMemo(() => getMapFocusForStream(selectedStream), [selectedStream]);

  useEffect(() => {
    let isMounted = true;

    const refreshStreams = async (): Promise<void> => {
      try {
        const devices = await fetchStreamDeviceOptions();
        if (!isMounted || devices.length === 0) return;
        setStreamDevices(devices);
        setStreams((current) => mergeStreamSlotsWithDevices(current, devices));
      } catch {
        if (isMounted) {
          setStreams((current) => current.map((stream) => ({ ...stream, status: stream.status === "online" ? "degraded" : stream.status })));
        }
      }
    };

    void refreshStreams();
    const intervalId = globalThis.setInterval(() => void refreshStreams(), 3000);

    return () => {
      isMounted = false;
      globalThis.clearInterval(intervalId);
    };
  }, []);

  const isWidgetPinned = (widgetId: DashboardWidgetId): boolean =>
    layout.find((item) => item.id === widgetId)?.pinned ?? false;

  const toggleWidgetPin = (widgetId: DashboardWidgetId): void => {
    const nextPinned = !isWidgetPinned(widgetId);
    setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
    setLayoutMessage(nextPinned ? "위젯 고정됨" : "위젯 고정 해제됨");
  };

  const resetLayout = (): void => {
    setLayout(resetDashboardLayout());
    setPopoutWidgetId(null);
    setLayoutMessage("기본 레이아웃으로 초기화됨");
  };

  const widgetControls = (widgetId: DashboardWidgetId, title: string) => (
    <WidgetHeaderActions
      isPinned={isWidgetPinned(widgetId)}
      onPopOut={setPopoutWidgetId}
      onTogglePin={toggleWidgetPin}
      title={title}
      widgetId={widgetId}
    />
  );

  const openStreamConnection = (streamId: string): void => {
    setSelectedStreamId(streamId);
    setEditingStreamId(streamId);
    setLayoutMessage("스트림 슬롯 선택됨");
  };

  const connectStreamDevice = (device: StreamDeviceOption): void => {
    setStreams((current) =>
      current.map((stream) =>
        stream.id === editingStreamId ? connectDeviceToStreamSlot(stream, device) : stream,
      ),
    );
    if (editingStreamId) {
      setSelectedStreamId(editingStreamId);
    }
    setEditingStreamId(null);
    setLayoutMessage("스트리밍 장비 연결됨");
  };

  const disconnectCurrentStreamSlot = (): void => {
    setStreams((current) =>
      current.map((stream) => (stream.id === editingStreamId ? disconnectStreamSlot(stream) : stream)),
    );
    setEditingStreamId(null);
    setLayoutMessage("스트리밍 장비 연결 해제됨");
  };

  return (
    <main className="ops-dashboard" aria-label="Field Ops Dashboard MVP">
      <header className="ops-dashboard__tabs" aria-label="주요 탭">
        <nav className="ops-dashboard__tab-list">
          <button className="ops-tab is-active" type="button">
            대시보드
          </button>
          <button className="ops-tab" type="button">
            CCTV
          </button>
          <button className="ops-tab" type="button">
            이벤트로그
          </button>
        </nav>
        <div className="ops-dashboard__actions">
          <span role="status">{layoutMessage}</span>
          <a className="ops-command-button is-primary" href="/publisher" role="button">
            웹캠 송출
          </a>
          <button className="ops-command-button" onClick={() => setIsWidgetDialogOpen(true)} type="button">
            위젯 추가
          </button>
          <button className="ops-command-button" onClick={resetLayout} type="button">
            초기화
          </button>
        </div>
      </header>

      <section className="ops-dashboard__grid">
        <aside
          aria-labelledby="asset-tree-title"
          className="ops-panel asset-tree"
          data-widget-id={assetTreeWidget.id}
          style={{ minHeight: assetTreeWidget.minHeight, minWidth: assetTreeWidget.minWidth }}
        >
          <AssetTreePanel controls={widgetControls("asset-tree", "자산트리")} root={DEFAULT_ASSET_TREE} />
        </aside>

        <section
          aria-labelledby="map-title"
          className="ops-panel tactical-map"
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
          <div className="tactical-map__canvas">
            <div className="map-toolbar" aria-label="지도 도구">
              <button type="button">⌖</button>
              <button type="button">＋</button>
              <button type="button">－</button>
              <button type="button">▧</button>
            </div>
            <div className="map-route" />
            {["DRN-01", "DRN-02", "UGV-01", "UGV-02", "SEN-01"].map((asset, index) => (
              <button
                className={`map-marker ${asset === "UGV-02" ? "is-warning" : "is-online"} marker-${index + 1}`}
                key={asset}
                type="button"
              >
                <span>{asset}</span>
              </button>
            ))}
            <div
              className={`map-focus ${mapFocus.hasGeometry ? "has-geometry" : ""}`}
              style={mapFocus.markerStyle}
            >
              <span className="map-focus__cone" style={mapFocus.coneStyle} />
              <span className="map-focus__label" data-testid="map-focus-label">
                {mapFocus.label}
              </span>
            </div>
            <div className="map-compass">N</div>
          </div>
        </section>

        <SelectedStreamPanel
          controls={widgetControls("selected-stream", "선택 스트림")}
          stream={selectedStream}
        />

        <StreamGrid
          onSelectStream={openStreamConnection}
          selectedStreamId={selectedStreamId}
          streams={streams}
        />

        <section
          aria-labelledby="status-title"
          className="ops-panel system-status"
          data-widget-id={systemStatusWidget.id}
          style={{ minHeight: systemStatusWidget.minHeight, minWidth: systemStatusWidget.minWidth }}
        >
          <SystemStatusPanel controls={widgetControls("system-status", "서버상태 / 연결상태 / 헬스체크")} />
        </section>

        <section
          aria-labelledby="telemetry-title"
          className="ops-panel telemetry-panel"
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
        </section>

        <section
          aria-labelledby="ai-title"
          className="ops-panel ai-panel"
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
        </section>
      </section>

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
