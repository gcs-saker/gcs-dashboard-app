export interface RttSample {
  checkedAt: number;
  latencyMs: number | null;
}

export interface RttStats {
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
  minLatencyMs: number | null;
}

export interface RttChartPoint {
  checkedAt: number;
  latencyMs: number;
  x: number;
  y: number;
}

export interface RttChart {
  oldestLabel: string;
  path: string;
  points: RttChartPoint[];
}

export const RTT_HISTORY_LIMIT = 60;
export const RTT_CHART_WIDTH = 640;
export const RTT_CHART_HEIGHT = 180;
export const RTT_CHART_PADDING = 28;

export function appendRttSample(
  current: RttSample[],
  sample: RttSample,
  limit = RTT_HISTORY_LIMIT,
): RttSample[] {
  if (current.at(-1)?.checkedAt === sample.checkedAt) {
    return current;
  }
  return [...current.slice(-(limit - 1)), sample];
}

export function rttMaxLatency(samples: RttSample[], floor = 120): number {
  return Math.max(floor, ...samples.map((sample) => sample.latencyMs ?? 0));
}

export function buildRttChart(
  samples: RttSample[],
  maxLatencyMs: number,
  now = Date.now(),
): RttChart {
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
    oldestLabel: validSamples[0] ? relativeMinutesLabel(validSamples[0].checkedAt, now) : "대기",
    path: points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "),
    points,
  };
}

export function buildRttStats(samples: RttSample[]): RttStats {
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

export function formatRttStat(value: number | null): string {
  return value === null ? "-" : `${value} ms`;
}

function relativeMinutesLabel(checkedAt: number, now: number): string {
  const diffMs = Math.max(0, now - checkedAt);
  if (diffMs < 60_000) return "방금 전";
  const minutes = Math.round(diffMs / 60_000);
  return `${minutes}분 전`;
}
