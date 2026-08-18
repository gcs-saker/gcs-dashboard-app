import { useEffect, useRef, useState } from "react";

const BAR_FLOOR = 4;
const DEFAULT_SAMPLE_COUNT = 48;
const SAMPLE_INTERVAL_MS = 120;

interface AudioWaveformHistoryOptions {
  audioLevel: number | null;
  isSignalPresent: boolean;
  sourceId: string;
  sampleCount?: number;
}

export function useAudioWaveformHistory({
  audioLevel,
  isSignalPresent,
  sourceId,
  sampleCount = DEFAULT_SAMPLE_COUNT,
}: AudioWaveformHistoryOptions): number[] {
  const normalizedSampleCount = normalizeSampleCount(sampleCount);
  const [samples, setSamples] = useState(() => quietSamples(normalizedSampleCount));
  const audioLevelRef = useRef(audioLevel);
  const tickRef = useRef(0);
  const sourceRef = useRef({ sampleCount: normalizedSampleCount, sourceId });

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    if (sourceRef.current.sourceId === sourceId && sourceRef.current.sampleCount === normalizedSampleCount) return;
    sourceRef.current = { sampleCount: normalizedSampleCount, sourceId };
    tickRef.current = 0;
    setSamples(quietSamples(normalizedSampleCount));
  }, [normalizedSampleCount, sourceId]);

  const hasResidualSignal = samples.some((sample) => sample > BAR_FLOOR + 0.5);

  useEffect(() => {
    if (!isSignalPresent && !hasResidualSignal) return undefined;

    const intervalId = window.setInterval(() => {
      setSamples((current) => appendSample(current, nextAmplitude(current, audioLevelRef.current, isSignalPresent, tickRef)));
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [hasResidualSignal, isSignalPresent]);

  return samples;
}

function nextAmplitude(
  samples: number[],
  audioLevel: number | null,
  isSignalPresent: boolean,
  tickRef: { current: number },
): number {
  const previous = samples.at(-1) ?? BAR_FLOOR;
  const normalizedLevel = audioLevel === null ? null : Math.min(1, Math.max(0, audioLevel));
  const target = normalizedLevel === null
    ? isSignalPresent
      ? 14 + (Math.sin(tickRef.current * 1.3) + 1) * 5
      : Math.max(BAR_FLOOR, previous * 0.76)
    : 8 + normalizedLevel * 86;
  const smoothed = previous + (target - previous) * 0.58;
  const variation = normalizedLevel === null ? 1 : 0.9 + Math.sin(tickRef.current * 1.7) * 0.1;
  tickRef.current += 1;
  return Math.max(BAR_FLOOR, Math.min(94, smoothed * variation));
}

function appendSample(samples: number[], next: number): number[] {
  return [...samples.slice(1), next];
}

function quietSamples(sampleCount: number): number[] {
  return Array.from({ length: sampleCount }, () => BAR_FLOOR);
}

function normalizeSampleCount(sampleCount: number): number {
  return Number.isFinite(sampleCount) ? Math.max(1, Math.floor(sampleCount)) : DEFAULT_SAMPLE_COUNT;
}
