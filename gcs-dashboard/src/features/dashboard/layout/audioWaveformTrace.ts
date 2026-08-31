const TRACE_WIDTH = 100;
const TRACE_HEIGHT = 100;

export function buildAudioWaveformTrace(samples: readonly number[]): string {
  if (samples.length === 0) return "";
  const denominator = Math.max(1, samples.length - 1);
  return samples.map((sample, index) => {
    const x = index * TRACE_WIDTH / denominator;
    const normalized = Math.min(100, Math.max(0, sample));
    const y = TRACE_HEIGHT - normalized;
    return `${formatCoordinate(x)},${formatCoordinate(y)}`;
  }).join(" ");
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(2)).toString();
}
