export const WAVEFORM_VIEWBOX_WIDTH = 1000;
export const WAVEFORM_VIEWBOX_HEIGHT = 100;
export const WAVEFORM_SAMPLE_COUNT = 240;

export function buildWaveformPoints(samples: number[], sampleCount: number): string {
  if (samples.length === 0 || sampleCount < 2) return "";
  const xStep = WAVEFORM_VIEWBOX_WIDTH / (sampleCount - 1);
  return samples.map((sample, index) => {
    const direction = index % 2 === 0 ? -1 : 1;
    const amplitude = Math.min(1, Math.max(0, sample)) * 46;
    return `${(index * xStep).toFixed(2)},${(50 + direction * amplitude).toFixed(2)}`;
  }).join(" ");
}
