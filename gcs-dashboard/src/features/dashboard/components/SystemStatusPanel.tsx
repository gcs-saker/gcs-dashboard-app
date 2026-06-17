import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SERVER_STATUS,
  fetchDashboardServerStatus,
  serverHealthText,
  type DashboardServerStatusSnapshot,
} from "../serverStatus";
import { AuthApiError } from "../../auth/authApi";
import { DASHBOARD_QUERY_KEYS, DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";

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

interface RttStats {
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  minLatencyMs: number | null;
}

export function SystemStatusPanel({ controls, fetcher, onAuthFailure, refreshMs = 5000, variant = "panel" }: SystemStatusPanelProps) {
  const [rttHistory, setRttHistory] = useState<RttSample[]>([]);
  const statusQuery = useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.serverStatus, refreshMs, fetcher ? "custom-fetcher" : "default-fetcher"],
    queryFn: () => fetchDashboardServerStatus(fetcher),
    initialData: DEFAULT_SERVER_STATUS,
    refetchInterval: refreshMs > 0 ? refreshMs : false,
  });
  const status = statusQuery.data;

  useEffect(() => {
    if (statusQuery.error instanceof AuthApiError && statusQuery.error.status === 401) {
      onAuthFailure?.();
    }
  }, [onAuthFailure, statusQuery.error]);

  useEffect(() => {
    if (!status.checkedAt) return;
    setRttHistory((current) => [
      ...current.slice(-(RTT_HISTORY_LIMIT - 1)),
      { checkedAt: status.checkedAt ?? Date.now(), latencyMs: status.latencyMs },
    ]);
  }, [status.checkedAt, status.latencyMs]);

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
  const rttStats = useMemo(() => buildRttStats(rttHistory), [rttHistory]);
  const latestRttText = status.latencyMs ? `${status.latencyMs} ms` : "측정 대기";
  const impactItems = useMemo(
    () =>
      [
        ["API", status.apiServer, status.apiServer === DASHBOARD_SERVER_HEALTH.online ? "조회/제어 정상" : "대시보드 데이터 지연 가능"],
        ["Auth", status.authServer, status.authServer === DASHBOARD_SERVER_HEALTH.online ? "세션 확인 정상" : "로그인/토큰 갱신 영향"],
        ["Signaling", status.signalingServer, status.signalingServer === DASHBOARD_SERVER_HEALTH.online ? "WHIP/WHEP 정상" : "신규 스트림 연결 영향"],
        ["Streams", status.streams, status.streams === DASHBOARD_SERVER_HEALTH.online ? "Registry 정상" : "스트림 목록/상태 반영 지연"],
      ] as const,
    [status.apiServer, status.authServer, status.signalingServer, status.streams],
  );

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
            <span>Operations Health</span>
            <h2>서버 상태</h2>
            <p>API, 인증, signaling, stream registry의 상태와 장애 영향 범위를 함께 확인합니다.</p>
          </div>
          <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
            전체 {serverHealthText(status.readiness)}
          </span>
        </header>

        <section className="system-status-page__state-preview" aria-label="상태 시안">
          {[
            ["정상", "is-online", "느린 녹색 테두리"],
            ["주의", "is-degraded", "노란 경고 강조"],
            ["불량", "is-error", "빨간 알림 강조"],
            ["미연결", "is-offline", "무채색 고정 상태"],
          ].map(([label, stateClass, description]) => (
            <article className={`system-state-sample ${stateClass}`} key={label}>
              <span className={`status-dot ${stateClass}`} />
              <strong>{label}</strong>
              <em>{description}</em>
            </article>
          ))}
        </section>

        {status.readiness !== DASHBOARD_SERVER_HEALTH.online ? (
          <section className={`system-status-alert is-${status.readiness}`} role="alert">
            <strong>서버 상태 확인 필요</strong>
            <span>{serverHealthText(status.readiness)} 상태입니다. 인증, signaling, stream registry 영향 범위를 우선 확인하세요.</span>
          </section>
        ) : null}

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
            <dl className="system-rtt-stats" aria-label="RTT 통계">
              <div>
                <dt>최저</dt>
                <dd>{formatRttStat(rttStats.minLatencyMs)}</dd>
              </div>
              <div>
                <dt>평균</dt>
                <dd>{formatRttStat(rttStats.avgLatencyMs)}</dd>
              </div>
              <div>
                <dt>최고</dt>
                <dd>{formatRttStat(rttStats.maxLatencyMs)}</dd>
              </div>
            </dl>
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
                  r="2.2"
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

        <section className="ops-panel system-status-page__impact" aria-label="장애 영향 범위">
          <div className="ops-panel__header">
            <h2>장애 영향 범위</h2>
            <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
              {serverHealthText(status.readiness)}
            </span>
          </div>
          <ul className="system-impact-list">
            {impactItems.map(([name, health, description]) => (
              <li className={`is-${health}`} key={name}>
                <span className={`status-dot is-${health}`} />
                <strong>{name}</strong>
                <em>{serverHealthText(health)}</em>
                <p>{description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="ops-panel system-status-page__panel system-status-page__runbook">
          <div className="ops-panel__header">
            <h2>운영 진단</h2>
            <span className="ops-badge">업데이트 {checkedText}</span>
          </div>
          <dl>
            <div>
              <dt>우선 조치</dt>
              <dd>{status.signalingServer === DASHBOARD_SERVER_HEALTH.online ? "API/Registry 확인" : "Signaling 경로 확인"}</dd>
            </div>
            <div>
              <dt>확인 지점</dt>
              <dd>이벤트로그, 컨테이너 health, 포트 상태</dd>
            </div>
            <div>
              <dt>로그 기준</dt>
              <dd>WARN/ERROR 증가, 401/502, ICE 실패</dd>
            </div>
            <div>
              <dt>후속 조치</dt>
              <dd>{status.readiness === DASHBOARD_SERVER_HEALTH.online ? "정상 추세 유지 확인" : "장애 영향 범위 우선 격리"}</dd>
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
  if (diffMs < 60_000) return "방금 전";
  const minutes = Math.round(diffMs / 60_000);
  return `${minutes}분 전`;
}

function buildRttStats(samples: RttSample[]): RttStats {
  const values = samples
    .map((sample) => sample.latencyMs)
    .filter((value): value is number => value !== null);
  if (!values.length) {
    return {
      avgLatencyMs: null,
      maxLatencyMs: null,
      minLatencyMs: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    avgLatencyMs: Math.round(total / values.length),
    maxLatencyMs: Math.max(...values),
    minLatencyMs: Math.min(...values),
  };
}

function formatRttStat(value: number | null): string {
  return value === null ? "-" : `${value} ms`;
}
