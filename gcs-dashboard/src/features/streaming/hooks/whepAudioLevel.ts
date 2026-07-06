export const AUDIO_ANALYSIS_FFT_SIZE = 256;
export const AUDIO_ANALYSIS_UPDATE_INTERVAL_MS = 120;
export const AUDIO_ANALYSIS_MIN_DELTA = 0.01;
export const AUDIO_ANALYSIS_GAIN = 4;

export function shouldEmitAudioLevel(previousLevel: number | null, nextLevel: number | null): boolean {
  if (
    previousLevel !== null &&
    nextLevel !== null &&
    Math.abs(previousLevel - nextLevel) < AUDIO_ANALYSIS_MIN_DELTA
  ) {
    return false;
  }
  return previousLevel !== nextLevel;
}

export function calculateRmsAudioLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 128;
    const normalizedSample = (sample - 128) / 128;
    sumSquares += normalizedSample * normalizedSample;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return Math.min(1, roundAudioLevel(rms * AUDIO_ANALYSIS_GAIN));
}

function roundAudioLevel(value: number): number {
  return Math.round(value * 100) / 100;
}
