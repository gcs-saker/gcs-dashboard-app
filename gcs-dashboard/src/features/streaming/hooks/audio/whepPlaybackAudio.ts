import type { Dispatch } from "react";

import type { WebRTCPlaybackSnapshot } from "@streaming/types";
import { audioStatsEqual, extractAudioStats } from "@streaming/hooks/audio/whepAudioStats";
import { EMPTY_AUDIO_STATS, type PlaybackAction } from "@streaming/hooks/playback/whepPlaybackContracts";

const AUDIO_STATE_POLL_INTERVAL_MS = 500;
const AUDIO_INACTIVE_HOLD_MS = 1200;
const AUDIO_STATS_POLL_INTERVAL_MS = 1000;

export function audioPlaybackDiagnostic(
  hasAudioTrack: boolean,
  isAudioActive: boolean,
  playbackBlocked: boolean,
): Pick<WebRTCPlaybackSnapshot, "audioPlaybackState" | "audioDiagnosticMessage"> {
  if (playbackBlocked) {
    return {
      audioPlaybackState: "playback-blocked",
      audioDiagnosticMessage: "브라우저 자동재생 정책으로 오디오 재생이 차단됨",
    };
  }
  if (!hasAudioTrack) {
    return {
      audioPlaybackState: "no-track",
      audioDiagnosticMessage: "오디오 트랙 없음",
    };
  }
  if (!isAudioActive) {
    return {
      audioPlaybackState: "track-muted",
      audioDiagnosticMessage: "오디오 트랙 수신 중이나 무음 또는 mute 상태",
    };
  }
  return {
    audioPlaybackState: "receiving",
    audioDiagnosticMessage: "오디오 수신 중",
  };
}

export function monitorAudioStats(peerConnection: RTCPeerConnection, dispatch: Dispatch<PlaybackAction>): () => void {
  let disposed = false;
  let previousStats = EMPTY_AUDIO_STATS;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;

  const update = async (): Promise<void> => {
    if (typeof peerConnection.getStats !== "function" || disposed) return;
    try {
      const report = await peerConnection.getStats();
      if (disposed) return;
      const nextStats = extractAudioStats(report);
      if (!audioStatsEqual(previousStats, nextStats)) {
        previousStats = nextStats;
        dispatch({ type: "audio-stats", stats: nextStats });
      }
    } catch {
      // A transient stats read must not terminate media playback monitoring.
    } finally {
      if (!disposed) timeoutId = globalThis.setTimeout(() => void update(), AUDIO_STATS_POLL_INTERVAL_MS);
    }
  };

  void update();
  return () => {
    disposed = true;
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    dispatch({ type: "audio-stats", stats: EMPTY_AUDIO_STATS });
  };
}

export function monitorAudioState(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
  const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
  let pendingInactiveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastEmitted = { hasAudioTrack: false, isAudioActive: false };

  const clearPendingInactive = () => {
    if (pendingInactiveTimer === null) return;
    globalThis.clearTimeout(pendingInactiveTimer);
    pendingInactiveTimer = null;
  };
  const emit = (next: { hasAudioTrack: boolean; isAudioActive: boolean }) => {
    if (sameAudioState(lastEmitted, next)) return;
    lastEmitted = next;
    dispatch({ type: "audio-state", ...next });
  };
  const readAudioState = () => {
    const liveTracks = audioTracks.filter((track) => track.readyState !== "ended");
    return {
      hasAudioTrack: liveTracks.length > 0,
      isAudioActive: liveTracks.some((track) => track.enabled && !track.muted),
    };
  };
  const update = () => {
    const next = readAudioState();
    if (shouldEmitImmediately(next)) {
      clearPendingInactive();
      emit(next);
      return;
    }

    if (lastEmitted.isAudioActive) {
      if (pendingInactiveTimer !== null) return;
      pendingInactiveTimer = globalThis.setTimeout(() => {
        pendingInactiveTimer = null;
        emit(readAudioState());
      }, AUDIO_INACTIVE_HOLD_MS);
      return;
    }

    emit(next);
  };

  update();
  const intervalId = globalThis.setInterval(update, AUDIO_STATE_POLL_INTERVAL_MS);
  const removeTrackListeners = listenToAudioTracks(audioTracks, update);

  return () => {
    clearPendingInactive();
    globalThis.clearInterval(intervalId);
    removeTrackListeners();
    dispatch({ type: "audio-state", hasAudioTrack: false, isAudioActive: false });
  };
}

function listenToAudioTracks(tracks: readonly MediaStreamTrack[], listener: () => void): () => void {
  for (const track of tracks) {
    track.addEventListener?.("mute", listener);
    track.addEventListener?.("unmute", listener);
    track.addEventListener?.("ended", listener);
  }
  return () => {
    for (const track of tracks) {
      track.removeEventListener?.("mute", listener);
      track.removeEventListener?.("unmute", listener);
      track.removeEventListener?.("ended", listener);
    }
  };
}

function sameAudioState(
  left: { hasAudioTrack: boolean; isAudioActive: boolean },
  right: { hasAudioTrack: boolean; isAudioActive: boolean },
): boolean {
  return left.hasAudioTrack === right.hasAudioTrack && left.isAudioActive === right.isAudioActive;
}

function shouldEmitImmediately(state: { hasAudioTrack: boolean; isAudioActive: boolean }): boolean {
  return state.isAudioActive || !state.hasAudioTrack;
}
