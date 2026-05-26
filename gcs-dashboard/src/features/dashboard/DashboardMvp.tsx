import { useMemo, useState } from "react";
import "./DashboardMvp.css";

type AssetStatus = "online" | "warning" | "offline";
type StreamStatus = "online" | "fallback" | "offline" | "error";

interface AssetNode {
  id: string;
  label: string;
  group: string;
  status: AssetStatus;
}

interface StreamCard {
  id: string;
  title: string;
  status: StreamStatus;
  mode: "EO" | "IR" | "AI" | "MAP";
  detail: string;
}

const assets: AssetNode[] = [
  { id: "DRN-01", label: "DRN-01", group: "드론", status: "online" },
  { id: "DRN-02", label: "DRN-02", group: "드론", status: "online" },
  { id: "UGV-01", label: "UGV-01", group: "지상로봇", status: "online" },
  { id: "UGV-02", label: "UGV-02", group: "지상로봇", status: "warning" },
  { id: "SEN-01", label: "SEN-01", group: "센서", status: "online" },
  { id: "SEN-04", label: "SEN-04", group: "센서", status: "offline" },
];

const streams: StreamCard[] = [
  { id: "raw.sample.front", title: "스트리밍 1", status: "online", mode: "EO", detail: "전방 EO / raw.sample.front" },
  { id: "raw.sample.thermal", title: "스트리밍 2", status: "fallback", mode: "IR", detail: "열화상 fallback / raw.sample.thermal" },
  { id: "raw.sample.rear", title: "스트리밍 3", status: "online", mode: "AI", detail: "AI 감지 overlay / raw.sample.rear" },
  { id: "raw.local.webcam", title: "스트리밍 4", status: "offline", mode: "MAP", detail: "로컬 웹캠 대기 / raw.local.webcam" },
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

function statusText(status: StreamStatus | AssetStatus): string {
  switch (status) {
    case "online":
      return "정상";
    case "warning":
      return "주의";
    case "fallback":
      return "Fallback";
    case "offline":
      return "오프라인";
    case "error":
      return "오류";
  }
}

function statusClass(status: StreamStatus | AssetStatus): string {
  return `is-${status}`;
}

export function DashboardMvp() {
  const [selectedStreamId, setSelectedStreamId] = useState(streams[0].id);
  const selectedStream = useMemo(
    () => streams.find((stream) => stream.id === selectedStreamId) ?? streams[0],
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
        <aside className="ops-panel asset-tree" aria-labelledby="asset-tree-title">
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

        <section className="ops-panel tactical-map" aria-labelledby="map-title">
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

        <section className="ops-panel selected-stream" aria-labelledby="selected-stream-title">
          <div className="ops-panel__header">
            <h2 id="selected-stream-title">선택 스트림</h2>
            <span className={`ops-badge ${statusClass(selectedStream.status)}`}>
              {statusText(selectedStream.status)}
            </span>
          </div>
          <div className={`selected-stream__viewport mode-${selectedStream.mode.toLowerCase()}`}>
            <div className="reticle" />
            <div className="selected-stream__meta">
              <strong>{selectedStream.title}</strong>
              <span>{selectedStream.detail}</span>
            </div>
          </div>
        </section>

        <section className="stream-grid" aria-label="다중 스트림">
          {streams.map((stream) => (
            <button
              aria-label={`${stream.title} 선택`}
              className={`stream-card ${stream.id === selectedStreamId ? "is-selected" : ""}`}
              key={stream.id}
              onClick={() => setSelectedStreamId(stream.id)}
              type="button"
            >
              <span className="stream-card__topline">
                <strong>{stream.title}</strong>
                <span className={`ops-badge ${statusClass(stream.status)}`}>
                  {statusText(stream.status)}
                </span>
              </span>
              <span className={`stream-card__visual mode-${stream.mode.toLowerCase()}`}>
                <span className="reticle" />
              </span>
              <span className="stream-card__detail">{stream.detail}</span>
            </button>
          ))}
        </section>

        <section className="ops-panel system-status" aria-labelledby="status-title">
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

        <section className="ops-panel telemetry-panel" aria-labelledby="telemetry-title">
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

        <section className="ops-panel ai-panel" aria-labelledby="ai-title">
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
