import { describe, expect, it } from "vitest";
import {
  appendRttSample,
  buildRttChart,
  buildRttStats,
  formatRttStat,
  rttMaxLatency,
  type RttSample,
} from "@dashboard/operations/systemStatusRtt";

describe("systemStatusRtt", () => {
  it("appends bounded RTT samples without duplicating the latest timestamp", () => {
    const samples: RttSample[] = [
      { checkedAt: 1, latencyMs: 30 },
      { checkedAt: 2, latencyMs: 40 },
    ];

    expect(appendRttSample(samples, { checkedAt: 2, latencyMs: 50 }, 2)).toBe(samples);
    expect(appendRttSample(samples, { checkedAt: 3, latencyMs: 50 }, 2)).toEqual([
      { checkedAt: 2, latencyMs: 40 },
      { checkedAt: 3, latencyMs: 50 },
    ]);
  });

  it("builds RTT stats while ignoring pending samples", () => {
    const samples: RttSample[] = [
      { checkedAt: 1, latencyMs: 30 },
      { checkedAt: 2, latencyMs: null },
      { checkedAt: 3, latencyMs: 90 },
    ];

    expect(buildRttStats(samples)).toEqual({
      avgLatencyMs: 60,
      maxLatencyMs: 90,
      minLatencyMs: 30,
    });
    expect(rttMaxLatency(samples)).toBe(120);
    expect(formatRttStat(null)).toBe("-");
    expect(formatRttStat(42)).toBe("42 ms");
  });

  it("builds stable chart coordinates and oldest label", () => {
    const now = 120_000;
    const chart = buildRttChart(
      [
        { checkedAt: 0, latencyMs: 30 },
        { checkedAt: 60_000, latencyMs: null },
        { checkedAt: 90_000, latencyMs: 60 },
      ],
      120,
      now,
    );

    expect(chart.oldestLabel).toBe("2분 전");
    expect(chart.points).toHaveLength(2);
    expect(chart.path).toMatch(/^M /);
  });
});
