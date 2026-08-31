import type { Dispatch } from "react";

import {
  AUDIO_ANALYSIS_FFT_SIZE,
  AUDIO_ANALYSIS_UPDATE_INTERVAL_MS,
  calculateRmsAudioLevel,
  shouldEmitAudioLevel,
} from "@streaming/hooks/audio/whepAudioLevel";
import type { PlaybackAction } from "@streaming/hooks/playback/whepPlaybackContracts";

export function monitorAudioLevel(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
  const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
  if (audioTracks.length === 0) {
    dispatch({ type: "audio-level", audioLevel: null });
    return () => undefined;
  }

  const audioContext = createAudioAnalysisContext(stream, dispatch);
  if (!audioContext) return () => undefined;

  let disposed = false;
  let animationFrameId: number | null = null;
  let lastEmittedLevel: number | null = null;
  let lastSampledAt = 0;

  const emitLevel = (audioLevel: number | null) => {
    if (!shouldEmitAudioLevel(lastEmittedLevel, audioLevel)) return;
    lastEmittedLevel = audioLevel;
    dispatch({ type: "audio-level", audioLevel });
  };

  const sampleAudioLevel = (sampledAt: number) => {
    if (disposed) return;
    animationFrameId = globalThis.requestAnimationFrame(sampleAudioLevel);
    if (sampledAt - lastSampledAt < AUDIO_ANALYSIS_UPDATE_INTERVAL_MS) return;
    lastSampledAt = sampledAt;
    audioContext.analyserNode.getByteTimeDomainData(audioContext.sampleBuffer);
    emitLevel(calculateRmsAudioLevel(audioContext.sampleBuffer));
  };

  void audioContext.context.resume?.().catch(() => undefined);
  animationFrameId = globalThis.requestAnimationFrame(sampleAudioLevel);

  return () => {
    disposed = true;
    if (animationFrameId !== null) {
      globalThis.cancelAnimationFrame(animationFrameId);
    }
    audioContext.sourceNode.disconnect();
    audioContext.analyserNode.disconnect();
    void audioContext.context.close?.().catch(() => undefined);
    dispatch({ type: "audio-level", audioLevel: null });
  };
}

interface AudioAnalysisContext {
  context: AudioContext;
  sourceNode: MediaStreamAudioSourceNode;
  analyserNode: AnalyserNode;
  sampleBuffer: Uint8Array<ArrayBuffer>;
}

function createAudioAnalysisContext(
  stream: MediaStream,
  dispatch: Dispatch<PlaybackAction>,
): AudioAnalysisContext | null {
  const AudioContextConstructor = resolveAudioContextConstructor();
  if (!AudioContextConstructor) {
    dispatch({ type: "audio-level", audioLevel: null });
    return null;
  }

  try {
    const context = new AudioContextConstructor();
    const analyserNode = context.createAnalyser();
    analyserNode.fftSize = AUDIO_ANALYSIS_FFT_SIZE;
    analyserNode.smoothingTimeConstant = 0.72;
    const sourceNode = context.createMediaStreamSource(stream);
    sourceNode.connect(analyserNode);
    return {
      context,
      sourceNode,
      analyserNode,
      sampleBuffer: new Uint8Array(analyserNode.fftSize),
    };
  } catch {
    dispatch({ type: "audio-level", audioLevel: null });
    return null;
  }
}

function resolveAudioContextConstructor(): typeof AudioContext | null {
  const audioGlobal = globalThis as typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  return audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext ?? null;
}
