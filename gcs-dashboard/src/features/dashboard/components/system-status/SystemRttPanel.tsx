import {
  formatRttStat,
  RTT_CHART_HEIGHT,
  RTT_CHART_PADDING,
  RTT_CHART_WIDTH,
  type RttChart,
  type RttStats,
} from "@dashboard/systemStatusRtt";

interface SystemRttPanelProps {
  latestRttText: string;
  rttChart: RttChart;
  rttMax: number;
  rttStats: RttStats;
}

export function SystemRttPanel({ latestRttText, rttChart, rttMax, rttStats }: SystemRttPanelProps) {
  return (
    <section className="ops-panel system-status-page__rtt" aria-label="네트워크 RTT 추세">
      <div className="ops-panel__header">
        <h2>네트워크 RTT 추세</h2>
        <span className="ops-badge">{latestRttText}</span>
      </div>
      <div className="system-rtt-chart" role="img" aria-label={`최근 RTT 추세, 현재 ${latestRttText}`}>
        <SystemRttStats stats={rttStats} />
        <svg viewBox={`0 0 ${RTT_CHART_WIDTH} ${RTT_CHART_HEIGHT}`} preserveAspectRatio="none">
          <line className="system-rtt-chart__axis" x1={RTT_CHART_PADDING} y1={RTT_CHART_PADDING} x2={RTT_CHART_PADDING} y2={RTT_CHART_HEIGHT - RTT_CHART_PADDING} />
          <line className="system-rtt-chart__axis" x1={RTT_CHART_PADDING} y1={RTT_CHART_HEIGHT - RTT_CHART_PADDING} x2={RTT_CHART_WIDTH - RTT_CHART_PADDING} y2={RTT_CHART_HEIGHT - RTT_CHART_PADDING} />
          {[0.25, 0.5, 0.75].map((ratio) => {
            const y = RTT_CHART_PADDING + (RTT_CHART_HEIGHT - RTT_CHART_PADDING * 2) * ratio;
            return <line className="system-rtt-chart__grid" key={ratio} x1={RTT_CHART_PADDING} y1={y} x2={RTT_CHART_WIDTH - RTT_CHART_PADDING} y2={y} />;
          })}
          {rttChart.path ? <path className="system-rtt-chart__line" d={rttChart.path} /> : null}
          {rttChart.points.map((point) => <circle className={point.latencyMs > 450 ? "is-warning" : ""} cx={point.x} cy={point.y} key={`${point.checkedAt}-${point.x}`} r="2.2" />)}
          <text x={RTT_CHART_PADDING} y="18">{rttMax}ms</text>
          <text x={RTT_CHART_PADDING} y={RTT_CHART_HEIGHT - 6}>0ms</text>
          <text x={RTT_CHART_WIDTH - 92} y={RTT_CHART_HEIGHT - 6}>현재</text>
          <text x={RTT_CHART_PADDING + 8} y={RTT_CHART_HEIGHT - 6}>{rttChart.oldestLabel}</text>
        </svg>
      </div>
      <p>최근 응답 지연을 기준으로 API, 인증, signaling 경로의 체감 상태를 판단합니다.</p>
    </section>
  );
}

function SystemRttStats({ stats }: { stats: RttStats }) {
  return (
    <dl className="system-rtt-stats" aria-label="RTT 통계">
      <div><dt>최저</dt><dd>{formatRttStat(stats.minLatencyMs)}</dd></div>
      <div><dt>평균</dt><dd>{formatRttStat(stats.avgLatencyMs)}</dd></div>
      <div><dt>최고</dt><dd>{formatRttStat(stats.maxLatencyMs)}</dd></div>
    </dl>
  );
}
