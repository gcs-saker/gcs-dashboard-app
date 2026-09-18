export interface PublisherRecoverySample {
  recovered: boolean;
  recoveryMs: number | null;
}

export interface PublisherRecoveryQualification {
  sampleCount: number;
  recoveredCount: number;
  successRate: number;
  averageRecoveryMs: number | null;
  p95RecoveryMs: number | null;
  maxRecoveryMs: number | null;
  qualified: boolean;
}

export interface PublisherRecoveryThresholds {
  minimumSamples: number;
  minimumSuccessRate: number;
  maximumRecoveryMs: number;
}

export const DEFAULT_PUBLISHER_RECOVERY_THRESHOLDS: PublisherRecoveryThresholds = {
  minimumSamples: 10,
  minimumSuccessRate: 0.99,
  maximumRecoveryMs: 6_000,
};

export function qualifyPublisherRecovery(
  samples: readonly PublisherRecoverySample[],
  thresholds: PublisherRecoveryThresholds = DEFAULT_PUBLISHER_RECOVERY_THRESHOLDS,
): PublisherRecoveryQualification {
  const durations = samples
    .filter((sample): sample is { recovered: true; recoveryMs: number } => sample.recovered && validDuration(sample.recoveryMs))
    .map((sample) => sample.recoveryMs)
    .reduce<number[]>((ordered, value) => insertOrdered(ordered, value), []);
  const recoveredCount = durations.length;
  const successRate = samples.length === 0 ? 0 : recoveredCount / samples.length;
  const maxRecoveryMs = durations.at(-1) ?? null;
  return {
    sampleCount: samples.length,
    recoveredCount,
    successRate,
    averageRecoveryMs: durations.length === 0 ? null : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    p95RecoveryMs: percentile95(durations),
    maxRecoveryMs,
    qualified: samples.length >= thresholds.minimumSamples && successRate >= thresholds.minimumSuccessRate &&
      maxRecoveryMs !== null && maxRecoveryMs <= thresholds.maximumRecoveryMs,
  };
}

function insertOrdered(ordered: readonly number[], value: number): number[] {
  const index = ordered.findIndex((current) => current > value);
  if (index === -1) return [...ordered, value];
  return [...ordered.slice(0, index), value, ...ordered.slice(index)];
}

function validDuration(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function percentile95(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
}
