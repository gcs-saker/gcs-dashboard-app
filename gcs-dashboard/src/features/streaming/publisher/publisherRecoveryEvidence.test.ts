import { describe, expect, test } from "vitest";

import { qualifyPublisherRecovery } from "./publisherRecoveryEvidence";

describe("publisherRecoveryEvidence", () => {
  test("qualifies a repeated network and background recovery soak", () => {
    const durations = [1_020, 1_080, 990, 1_110, 1_040, 1_060, 1_030, 1_090, 1_010, 1_070];
    const evidence = qualifyPublisherRecovery(durations.map((recoveryMs) => ({ recovered: true, recoveryMs })));

    expect(evidence).toEqual({
      sampleCount: 10,
      recoveredCount: 10,
      successRate: 1,
      averageRecoveryMs: 1_050,
      p95RecoveryMs: 1_110,
      maxRecoveryMs: 1_110,
      qualified: true,
    });
  });

  test("fails closed for missing, failed, invalid, or over-budget samples", () => {
    expect(qualifyPublisherRecovery([]).qualified).toBe(false);
    expect(qualifyPublisherRecovery([
      ...Array.from({ length: 9 }, () => ({ recovered: true, recoveryMs: 1_000 })),
      { recovered: false, recoveryMs: null },
    ]).qualified).toBe(false);
    expect(qualifyPublisherRecovery(Array.from({ length: 10 }, () => ({ recovered: true, recoveryMs: 6_001 }))).qualified).toBe(false);
    expect(qualifyPublisherRecovery(Array.from({ length: 10 }, () => ({ recovered: true, recoveryMs: Number.NaN }))).qualified).toBe(false);
  });
});
