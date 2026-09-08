import { useEffect, useRef, useState } from "react";

const DEFAULT_SAMPLE_COUNT = 240;
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
  const [samples, setSamples] = useState<number[]>([]);
  const audioLevelRef = useRef(audioLevel);
  const sourceRef = useRef({ sampleCount: normalizedSampleCount, sourceId });

  useEffect(() => {
    audioLevelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    if (sourceRef.current.sourceId === sourceId && sourceRef.current.sampleCount === normalizedSampleCount) return;
    sourceRef.current = { sampleCount: normalizedSampleCount, sourceId };
    setSamples([]);
  }, [normalizedSampleCount, sourceId]);

  useEffect(() => {
    if (!isSignalPresent) return undefined;

    const intervalId = window.setInterval(() => {
      const currentLevel = normalizeAudioLevel(audioLevelRef.current);
      if (currentLevel === null) return;
      setSamples((current) => appendSample(current, currentLevel, normalizedSampleCount));
    }, SAMPLE_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [isSignalPresent, normalizedSampleCount]);

  return samples;
}

function normalizeAudioLevel(audioLevel: number | null): number | null {
  if (audioLevel === null || !Number.isFinite(audioLevel)) return null;
  return Math.min(1, Math.max(0, audioLevel));
}

function appendSample(samples: number[], next: number, sampleCount: number): number[] {
  if (samples.length < sampleCount) return [...samples, next];
  return [...samples.slice(1), next];
}

function normalizeSampleCount(sampleCount: number): number {
  return Number.isFinite(sampleCount) ? Math.max(1, Math.floor(sampleCount)) : DEFAULT_SAMPLE_COUNT;
}
