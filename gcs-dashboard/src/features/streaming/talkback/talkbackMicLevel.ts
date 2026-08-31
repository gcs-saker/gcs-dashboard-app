const MIC_ANALYSIS_FFT_SIZE = 256;
const MIC_ANALYSIS_INTERVAL_MS = 120;
const MIC_LEVEL_GAIN = 4;

export function monitorLocalMicLevel(
  stream: MediaStream,
  setMicLevel: (level: number | null) => void,
): () => void {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    setMicLevel(null);
    return () => undefined;
  }

  const audioContext = new AudioContextConstructor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = MIC_ANALYSIS_FFT_SIZE;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.frequencyBinCount);
  let intervalId: ReturnType<typeof globalThis.setInterval> | null = globalThis.setInterval(() => {
    analyser.getByteTimeDomainData(samples);
    setMicLevel(calculateMicLevel(samples));
  }, MIC_ANALYSIS_INTERVAL_MS);

  return () => {
    if (intervalId) {
      globalThis.clearInterval(intervalId);
      intervalId = null;
    }
    source.disconnect();
    void audioContext.close();
    setMicLevel(null);
  };
}

export function calculateMicLevel(samples: Uint8Array, gain = MIC_LEVEL_GAIN): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * gain);
}
