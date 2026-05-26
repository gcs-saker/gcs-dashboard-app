import { useMemo, useState } from "react";
import { SelectedStreamPanel } from "./components/SelectedStreamPanel";
import { StreamGrid } from "./components/StreamGrid";
import { getDashboardWidgetDefinition } from "./dashboardLayout";
import "./DashboardMvp.css";
import { DEFAULT_DASHBOARD_STREAMS } from "./streamTypes";

type AssetStatus = "online" | "warning" | "offline";

interface AssetNode {
  id: string;
  label: string;
  group: string;
  status: AssetStatus;
}

const assets: AssetNode[] = [
  { id: "DRN-01", label: "DRN-01", group: "드론", status: "online" },
  { id: "DRN-02", label: "DRN-02", group: "드론", status: "online" },
  { id: "UGV-01", label: "UGV-01", group: "지상로봇", status: "online" },
  { id: "UGV-02", label: "UGV-02", group: "지상로봇", status: "warning" },
  { id: "SEN-01", label: "SEN-01", group: "센서", status: "online" },
  { id: "SEN-04", label: "SEN-04", group: "센서", status: "offline" },
];

const telemetryRows = [
  ["위도", "37.123456"],
  ["경도", "127.123456"],
  ["고도", "120 m AGL"],
  ["속도", "36 km/h"],
  ["배터리", "78%"],
  ["링크", "95% / 42 ms"],
];

const statusRows = [
  ["서버상태", "정상", "online"],
  ["연결 자산", "9 / 9", "online"],
  ["네트워크", "42 ms", "online"],
  ["헬스체크", "정상", "online"],
];

function statusText(status: AssetStatus): string {
  switch (status) {
    case "online":
      return "정상";
    case "warning":
      return "주의";
    case "offline":
      return "오프라인";
  }
}

function statusClass(status: AssetStatus): string {
  return `is-${status}`;
}

export function DashboardMvp() {
  const assetTreeWidget = getDashboardWidgetDefinition("asset-tree");
  const tacticalMapWidget = getDashboardWidgetDefinition("tactical-map");
  const systemStatusWidget = getDashboardWidgetDefinition("system-status");
  const telemetryWidget = getDashboardWidgetDefinition("telemetry-panel");
  const aiResultsWidget = getDashboardWidgetDefinition("ai-results");
  const [selectedStreamId, setSelectedStreamId] = useState(DEFAULT_DASHBOARD_STREAMS[0].id);
  const selectedStream = useMemo(
    () =>
      DEFAULT_DASHBOARD_STREAMS.find((stream) => stream.id === selectedStreamId) ??
      DEFAULT_DASHBOARD_STREAMS[0],
    [selectedStreamId],
  );

  const groupedAssets = useMemo(
    () =>
      assets.reduce<Record<string, AssetNode[]>>((groups, asset) => {
        groups[asset.group] = [...(groups[asset.group] ?? []), asset];
        return groups;
      }, {}),
    [],
  );

  return (
    <main className="ops-dashboard" aria-label="Field Ops Dashboard MVP">
      <header className="ops-dashboard__tabs" aria-label="주요 탭">
        <button className="ops-tab is-active" type="button">
          대시보드
        </button>
        <button className="ops-tab" type="button">
          CCTV
        </button>
        <button className="ops-tab" type="button">
          이벤트로그
        </button>
      </header>

      <section className="ops-dashboard__grid">
        <aside
          aria-labelledby="asset-tree-title"
          className="ops-panel asset-tree"
          data-widget-id={assetTreeWidget.id}
          style={{ minHeight: assetTreeWidget.minHeight, minWidth: assetTreeWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="asset-tree-title">자산트리</h2>
            <span className="ops-badge is-online">LIVE</span>
          </div>

          <div className="asset-tree__root">GCS-SAKER</div>
          {Object.entries(groupedAssets).map(([group, groupAssets]) => (
            <div className="asset-group" key={group}>
              <div className="asset-group__title">{group}</div>
              <ul>
                {groupAssets.map((asset) => (
                  <li className="asset-node" key={asset.id}>
                    <span className={`status-dot ${statusClass(asset.status)}`} />
                    <span>{asset.label}</span>
                    <span className="asset-node__status">{statusText(asset.status)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section
          aria-labelledby="map-title"
          className="ops-panel tactical-map"
          data-widget-id={tacticalMapWidget.id}
          style={{ minHeight: tacticalMapWidget.minHeight, minWidth: tacticalMapWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="map-title">지도</h2>
            <span className="ops-badge">500 m</span>
          </div>
          <div className="tactical-map__canvas">
            <div className="map-toolbar" aria-label="지도 도구">
              <button type="button">⌖</button>
              <button type="button">＋</button>
              <button type="button">－</button>
              <button type="button">▧</button>
            </div>
            <div className="map-route" />
            {assets.slice(0, 5).map((asset, index) => (
              <button
                className={`map-marker ${statusClass(asset.status)} marker-${index + 1}`}
                key={asset.id}
                type="button"
              >
                <span>{asset.label}</span>
              </button>
            ))}
            <div className="map-compass">N</div>
          </div>
        </section>

        <SelectedStreamPanel stream={selectedStream} />

        <StreamGrid
          onSelectStream={setSelectedStreamId}
          selectedStreamId={selectedStreamId}
          streams={DEFAULT_DASHBOARD_STREAMS}
        />

        <section
          aria-labelledby="status-title"
          className="ops-panel system-status"
          data-widget-id={systemStatusWidget.id}
          style={{ minHeight: systemStatusWidget.minHeight, minWidth: systemStatusWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="status-title">서버상태 / 연결상태 / 헬스체크</h2>
          </div>
          <dl>
            {statusRows.map(([label, value, status]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <span className={`status-dot is-${status}`} />
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section
          aria-labelledby="telemetry-title"
          className="ops-panel telemetry-panel"
          data-widget-id={telemetryWidget.id}
          style={{ minHeight: telemetryWidget.minHeight, minWidth: telemetryWidget.minWidth }}
        >
          <div className="ops-panel__header">
            <h2 id="telemetry-title">지오메트리 / 텔레메트리</h2>
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
            <span className="ops-badge is-warning">대기</span>
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
    </main>
  );
}
