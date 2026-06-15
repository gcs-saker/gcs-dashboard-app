import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SERVER_STATUS,
  fetchDashboardServerStatus,
  serverHealthText,
  type DashboardServerStatusSnapshot,
} from "../serverStatus";
import { AuthApiError } from "../../auth/authApi";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";

interface SystemStatusPanelProps {
  controls?: ReactNode;
  fetcher?: typeof fetch;
  onAuthFailure?: () => void;
  refreshMs?: number;
  variant?: "panel" | "page";
}

interface RttSample {
  checkedAt: number;
  latencyMs: number | null;
}

const RTT_HISTORY_LIMIT = 60;
const RTT_CHART_WIDTH = 640;
const RTT_CHART_HEIGHT = 180;
const RTT_CHART_PADDING = 28;

export function SystemStatusPanel({ controls, fetcher, onAuthFailure, refreshMs = 5000, variant = "panel" }: SystemStatusPanelProps) {
  const [status, setStatus] = useState<DashboardServerStatusSnapshot>(DEFAULT_SERVER_STATUS);
  const [rttHistory, setRttHistory] = useState<RttSample[]>([]);

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const snapshot = await fetchDashboardServerStatus(fetcher);
        if (isMounted) {
          setStatus(snapshot);
          setRttHistory((current) => [
            ...current.slice(-(RTT_HISTORY_LIMIT - 1)),
            { checkedAt: snapshot.checkedAt ?? Date.now(), latencyMs: snapshot.latencyMs },
          ]);
        }
      } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) {
          if (intervalId) {
            globalThis.clearInterval(intervalId);
          }
          onAuthFailure?.();
        }
      }
    };

    void refresh();
    intervalId = globalThis.setInterval(() => void refresh(), refreshMs);

    return () => {
      isMounted = false;
      if (intervalId) {
        globalThis.clearInterval(intervalId);
      }
    };
  }, [fetcher, onAuthFailure, refreshMs]);

  const rows = useMemo(
    () => [
      ["API 서버", serverHealthText(status.apiServer), status.apiServer],
      ["인증/인가 서버", serverHealthText(status.authServer), status.authServer],
      ["Signaling 서버", serverHealthText(status.signalingServer), status.signalingServer],
      ["스트림 Registry", serverHealthText(status.streams), status.streams],
      ["네트워크 RTT", status.latencyMs ? `${status.latencyMs} ms` : "측정 대기", status.readiness],
      ["통합 헬스체크", serverHealthText(status.readiness), status.readiness],
    ],
    [status.apiServer, status.authServer, status.latencyMs, status.readiness, status.signalingServer, status.streams],
  );
  const checkedText = useMemo(
    () =>
      status.checkedAt
        ? new Date(status.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
        : "대기",
    [status.checkedAt],
  );
  const serviceCards = useMemo(
    () =>
      [
        ["API", "REST / Health / Stream Registry", status.apiServer],
        ["Auth", "세션 / 권한 / CSRF", status.authServer],
        ["Signaling", "WHIP / WHEP / ICE", status.signalingServer],
        ["Streams", "Media path / Registry", status.streams],
        ["Ready", "통합 readiness", status.readiness],
      ] as const,
    [status.apiServer, status.authServer, status.readiness, status.signalingServer, status.streams],
  );
  const rttMax = useMemo(
    () => Math.max(120, ...rttHistory.map((sample) => sample.latencyMs ?? 0)),
    [rttHistory],
  );
  const rttChart = useMemo(() => buildRttChart(rttHistory, rttMax), [rttHistory, rttMax]);
  const latestRttText = status.latencyMs ? `${status.latencyMs} ms` : "측정 대기";

  const primaryPanel = (
    <section className={variant === "page" ? "ops-panel system-status-page__panel" : undefined}>
      <div className="ops-panel__header">
        <h2 id="status-title">서버 상태 상세 / 연결상태 / 헬스체크</h2>
        {controls}
      </div>
      <dl>
        {rows.map(([label, value, rowStatus]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span className={`status-dot is-${rowStatus}`} />
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="system-status__updated">업데이트 {checkedText}</p>
    </section>
  );

  if (variant === "page") {
    return (
      <div className="system-status-page">
        <header className="system-status-page__hero">
          <div>
            <span>Operations Topology</span>
            <h2>서버 상태</h2>
            <p>API, 인증, signaling, stream registry의 상태와 장애 영향 범위를 함께 확인합니다.</p>
          </div>
          <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
            전체 {serverHealthText(status.readiness)}
          </span>
        </header>

        <section className="system-status-page__services" aria-label="서비스 상태 카드">
          {serviceCards.map(([name, description, health]) => (
            <article className={`system-service-card is-${health}`} key={name}>
              <span className={`status-dot is-${health}`} />
              <strong>{name}</strong>
              <em>{serverHealthText(health)}</em>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="ops-panel system-status-page__rtt" aria-label="네트워크 RTT 추세">
          <div className="ops-panel__header">
            <h2>네트워크 RTT 추세</h2>
            <span className="ops-badge">{latestRttText}</span>
          </div>
          <div className="system-rtt-chart" role="img" aria-label={`최근 RTT 추세, 현재 ${latestRttText}`}>
            <svg viewBox={`0 0 ${RTT_CHART_WIDTH} ${RTT_CHART_HEIGHT}`} preserveAspectRatio="none">
              <line className="system-rtt-chart__axis" x1={RTT_CHART_PADDING} y1={RTT_CHART_PADDING} x2={RTT_CHART_PADDING} y2={RTT_CHART_HEIGHT - RTT_CHART_PADDING} />
              <line className="system-rtt-chart__axis" x1={RTT_CHART_PADDING} y1={RTT_CHART_HEIGHT - RTT_CHART_PADDING} x2={RTT_CHART_WIDTH - RTT_CHART_PADDING} y2={RTT_CHART_HEIGHT - RTT_CHART_PADDING} />
              {[0.25, 0.5, 0.75].map((ratio) => {
                const y = RTT_CHART_PADDING + (RTT_CHART_HEIGHT - RTT_CHART_PADDING * 2) * ratio;
                return <line className="system-rtt-chart__grid" key={ratio} x1={RTT_CHART_PADDING} y1={y} x2={RTT_CHART_WIDTH - RTT_CHART_PADDING} y2={y} />;
              })}
              {rttChart.path ? <path className="system-rtt-chart__line" d={rttChart.path} /> : null}
              {rttChart.points.map((point) => (
                <circle
                  className={point.latencyMs > 450 ? "is-warning" : ""}
                  cx={point.x}
                  cy={point.y}
                  key={`${point.checkedAt}-${point.x}`}
                  r="3.2"
                />
              ))}
              <text x={RTT_CHART_PADDING} y="18">{rttMax}ms</text>
              <text x={RTT_CHART_PADDING} y={RTT_CHART_HEIGHT - 6}>0ms</text>
              <text x={RTT_CHART_WIDTH - 92} y={RTT_CHART_HEIGHT - 6}>현재</text>
              <text x={RTT_CHART_PADDING + 8} y={RTT_CHART_HEIGHT - 6}>{rttChart.oldestLabel}</text>
            </svg>
          </div>
          <p>최근 응답 지연을 기준으로 API, 인증, signaling 경로의 체감 상태를 판단합니다.</p>
        </section>

        <section className="ops-panel system-status-page__topology" aria-label="서비스 의존 구조도">
          <div className="ops-panel__header">
            <h2>서비스 의존 구조도</h2>
            <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
              {serverHealthText(status.readiness)}
            </span>
          </div>
          <div className="system-topology">
            <span>Dashboard</span>
            <i />
            <span>Edge / Nginx</span>
            <i />
            <span>API + Auth</span>
            <i />
            <span>DB / Redis</span>
            <span>MediaMTX</span>
            <i />
            <span>STUN / TURN</span>
          </div>
        </section>

        {primaryPanel}

        <section className="ops-panel system-status-page__panel system-status-page__runbook">
          <div className="ops-panel__header">
            <h2>운영 진단</h2>
            <span className="ops-badge">업데이트 {checkedText}</span>
          </div>
          <dl>
            <div>
              <dt>네트워크 RTT</dt>
              <dd>{status.latencyMs ? `${status.latencyMs} ms` : "측정 대기"}</dd>
            </div>
            <div>
              <dt>장애 영향</dt>
              <dd>{status.readiness === DASHBOARD_SERVER_HEALTH.online ? "운영 영향 없음" : "기능 저하 가능"}</dd>
            </div>
            <div>
              <dt>우선 조치</dt>
              <dd>{status.signalingServer === DASHBOARD_SERVER_HEALTH.online ? "API/Registry 확인" : "Signaling 경로 확인"}</dd>
            </div>
            <div>
              <dt>권장 확인</dt>
              <dd>이벤트로그, 컨테이너 health, 포트 상태</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  return primaryPanel;
}

function buildRttChart(samples: RttSample[], maxLatencyMs: number): {
  oldestLabel: string;
  path: string;
  points: Array<{ checkedAt: number; latencyMs: number; x: number; y: number }>;
} {
  const validSamples = samples.filter((sample): sample is RttSample & { latencyMs: number } => sample.latencyMs !== null);
  const chartWidth = RTT_CHART_WIDTH - RTT_CHART_PADDING * 2;
  const chartHeight = RTT_CHART_HEIGHT - RTT_CHART_PADDING * 2;
  const denominator = Math.max(1, validSamples.length - 1);
  const points = validSamples.map((sample, index) => {
    const x = RTT_CHART_PADDING + chartWidth * (index / denominator);
    const y = RTT_CHART_HEIGHT - RTT_CHART_PADDING - chartHeight * (Math.min(maxLatencyMs, sample.latencyMs) / maxLatencyMs);
    return { checkedAt: sample.checkedAt, latencyMs: sample.latencyMs, x, y };
  });
  return {
    oldestLabel: validSamples[0] ? relativeMinutesLabel(validSamples[0].checkedAt) : "대기",
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
    points,
  };
}

function relativeMinutesLabel(checkedAt: number): string {
  const diffMs = Math.max(0, Date.now() - checkedAt);
  const minutes = Math.max(1, Math.round(diffMs / 60_000));
  return `${minutes}분 전`;
}
