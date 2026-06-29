import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";

import { WEBRTC_ICE_SERVERS } from "../../../config";
import { loadWebRtcIceServers } from "../iceServers";
import type { WebRTCPlaybackSnapshot } from "../types";
import {
  audioPlaybackDiagnostic,
  audioStatsEqual,
  monitorAudioLevel,
  monitorAudioState,
  monitorAudioStats,
} from "./whepPlaybackAudio";
import {
  connectWithWhep,
  createPeerConnection,
  dispatchStateFromConnection,
  requestVideoPlayback,
  statusFromConnection,
} from "./whepPlaybackConnection";
import {
  EMPTY_AUDIO_STATS,
  EMPTY_ICE_CANDIDATE_STATS,
  EMPTY_SIGNALING_TIMINGS,
  type PeerConnectionFactory,
  type PlaybackAction,
  type SignalingTimingRecorder,
} from "./whepPlaybackContracts";
import { messageFromUnknown, reportWhepDebug } from "./whepPlaybackDebug";
import { incrementIceCandidateStats } from "./whepPlaybackIce";

interface UseWhepPlaybackOptions {
  whepUrl: string | null;
  isOnline?: boolean;
  peerConnectionFactory?: PeerConnectionFactory;
  fetcher?: typeof fetch;
}

const initialPlaybackState: WebRTCPlaybackSnapshot = {
  status: "idle",
  connectionState: "new",
  iceConnectionState: "new",
  errorMessage: null,
  hasVideoFrame: false,
  hasAudioTrack: false,
  isAudioActive: false,
  audioPlaybackState: "no-track",
  audioDiagnosticMessage: "오디오 트랙 없음",
  firstFrameLatencyMs: null,
  signalingTimings: EMPTY_SIGNALING_TIMINGS,
  audioStats: EMPTY_AUDIO_STATS,
  iceCandidateStats: EMPTY_ICE_CANDIDATE_STATS,
};

export function useWhepPlayback({
  whepUrl,
  isOnline = true,
  peerConnectionFactory,
  fetcher = fetch,
}: UseWhepPlaybackOptions): WebRTCPlaybackSnapshot & { videoRef: RefObject<HTMLVideoElement | null> } {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [snapshot, dispatch] = useReducer(playbackReducer, initialPlaybackState);

  useEffect(() => {
    if (!isOnline) {
      dispatch({ type: "offline" });
      return;
    }

    if (!whepUrl) {
      dispatch({ type: "error", message: "WHEP URL is required" });
      return;
    }

    const resolvedWhepUrl = whepUrl;
    let peerConnection: RTCPeerConnection | null = null;
    const abortController = new AbortController();
    let disposed = false;
    let stopAudioMonitor: (() => void) | null = null;
    let stopAudioLevelMonitor: (() => void) | null = null;
    let stopAudioStatsMonitor: (() => void) | null = null;
    const startedAt = performance.now();
    const recordTiming: SignalingTimingRecorder = (stage) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: "signaling-timing", stage, latencyMs: performance.now() - startedAt });
    };

    const videoElement = videoRef.current;
    const handleFirstFrame = () => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: "first-frame", latencyMs: performance.now() - startedAt });
    };
    videoElement?.addEventListener("loadeddata", handleFirstFrame, { once: true });

    dispatch({
      type: "loading",
      connectionState: "new",
      iceConnectionState: "new",
    });

    void startWhepPlayback().catch((error) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "WebRTC playback failed",
        connectionState: peerConnection?.connectionState,
        iceConnectionState: peerConnection?.iceConnectionState,
      });
    });

    async function startWhepPlayback(): Promise<void> {
      reportWhepDebug("start", resolvedWhepUrl);
      const iceServers = peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(fetcher);
      if (disposed || abortController.signal.aborted) return;
      recordTiming("iceServersLoadedMs");
      reportWhepDebug("ice-loaded", resolvedWhepUrl, { count: String(iceServers.length) });

      try {
        peerConnection = peerConnectionFactory?.() ?? createPeerConnection(iceServers, resolvedWhepUrl);
        reportWhepDebug("pc-created", resolvedWhepUrl);
      } catch (error) {
        reportWhepDebug("pc-error", resolvedWhepUrl, { message: messageFromUnknown(error) });
        dispatch({
          type: "unsupported",
          message: error instanceof Error ? error.message : "WebRTC is not supported",
        });
        return;
      }

      dispatch({
        type: "loading",
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });

      peerConnection.addTransceiver("video", { direction: "recvonly" });
      peerConnection.addTransceiver("audio", { direction: "recvonly" });

      peerConnection.ontrack = (event) => {
        if (!videoRef.current) return;

        const [stream] = event.streams;
        if (stream) {
          stopAudioMonitor?.();
          stopAudioLevelMonitor?.();
          stopAudioMonitor = monitorAudioState(stream, dispatch);
          stopAudioLevelMonitor = monitorAudioLevel(stream, dispatch);
          videoRef.current.srcObject = stream;
          requestVideoPlayback(videoRef.current, dispatch);
          return;
        }

        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
        stopAudioMonitor?.();
        stopAudioLevelMonitor?.();
        stopAudioMonitor = monitorAudioState(remoteStreamRef.current, dispatch);
        stopAudioLevelMonitor = monitorAudioLevel(remoteStreamRef.current, dispatch);
        videoRef.current.srcObject = remoteStreamRef.current;
        requestVideoPlayback(videoRef.current, dispatch);
      };

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection) {
          dispatchStateFromConnection(peerConnection, dispatch);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection) {
          dispatchStateFromConnection(peerConnection, dispatch);
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          dispatch({ type: "ice-candidate", candidate: event.candidate });
        }
      };

      stopAudioStatsMonitor = monitorAudioStats(peerConnection, dispatch);
      await connectWithWhep(peerConnection, resolvedWhepUrl, fetcher, abortController.signal, recordTiming);
    }

    return () => {
      disposed = true;
      abortController.abort();
      peerConnection?.close();
      stopAudioMonitor?.();
      stopAudioLevelMonitor?.();
      stopAudioStatsMonitor?.();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      remoteStreamRef.current = null;
      videoElement?.removeEventListener("loadeddata", handleFirstFrame);
    };
  }, [fetcher, isOnline, peerConnectionFactory, whepUrl]);

  return { ...snapshot, videoRef };
}

function playbackReducer(
  state: WebRTCPlaybackSnapshot,
  action: PlaybackAction,
): WebRTCPlaybackSnapshot {
  switch (action.type) {
    case "loading":
      return {
        status: "loading",
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
        errorMessage: null,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        audioPlaybackState: "no-track",
        audioDiagnosticMessage: "오디오 트랙 없음",
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
        audioStats: EMPTY_AUDIO_STATS,
        iceCandidateStats: EMPTY_ICE_CANDIDATE_STATS,
      };
    case "playing":
      return {
        status: "playing",
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
        errorMessage: null,
        hasVideoFrame: state.hasVideoFrame,
        hasAudioTrack: state.hasAudioTrack,
        isAudioActive: state.isAudioActive,
        audioPlaybackState: state.audioPlaybackState,
        audioDiagnosticMessage: state.audioDiagnosticMessage,
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
        iceCandidateStats: state.iceCandidateStats,
      };
    case "offline":
      return {
        status: "offline",
        connectionState: "closed",
        iceConnectionState: "closed",
        errorMessage: null,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        audioPlaybackState: "no-track",
        audioDiagnosticMessage: "오디오 트랙 없음",
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
        audioStats: EMPTY_AUDIO_STATS,
        iceCandidateStats: EMPTY_ICE_CANDIDATE_STATS,
      };
    case "unsupported":
      return {
        status: "error",
        connectionState: "unsupported",
        iceConnectionState: "unsupported",
        errorMessage: action.message,
        hasVideoFrame: false,
        hasAudioTrack: false,
        isAudioActive: false,
        audioPlaybackState: "no-track",
        audioDiagnosticMessage: "오디오 트랙 없음",
        firstFrameLatencyMs: null,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
        iceCandidateStats: state.iceCandidateStats,
      };
    case "error":
      return {
        status: "error",
        connectionState: action.connectionState ?? state.connectionState,
        iceConnectionState: action.iceConnectionState ?? state.iceConnectionState,
        errorMessage: action.message,
        hasVideoFrame: state.hasVideoFrame,
        hasAudioTrack: state.hasAudioTrack,
        isAudioActive: state.isAudioActive,
        audioPlaybackState: state.audioPlaybackState,
        audioDiagnosticMessage: state.audioDiagnosticMessage,
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
        audioStats: state.audioStats,
        iceCandidateStats: state.iceCandidateStats,
      };
    case "connection":
      return {
        ...state,
        status: statusFromConnection(action.connectionState, action.iceConnectionState, state.status),
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
      };
    case "first-frame":
      return {
        ...state,
        hasVideoFrame: true,
        firstFrameLatencyMs: Math.max(0, Math.round(action.latencyMs)),
      };
    case "audio-state":
      if (
        state.hasAudioTrack === action.hasAudioTrack &&
        state.isAudioActive === action.isAudioActive
      ) {
        return state;
      }
      return {
        ...state,
        hasAudioTrack: action.hasAudioTrack,
        isAudioActive: action.isAudioActive,
        ...audioPlaybackDiagnostic(action.hasAudioTrack, action.isAudioActive, state.audioPlaybackState === "playback-blocked"),
      };
    case "audio-playback":
      if ((state.audioPlaybackState === "playback-blocked") === action.blocked) {
        return state;
      }
      return {
        ...state,
        ...audioPlaybackDiagnostic(state.hasAudioTrack, state.isAudioActive, action.blocked),
      };
    case "audio-level": {
      if (state.audioStats.audioLevel === action.audioLevel) {
        return state;
      }
      return {
        ...state,
        audioStats: {
          ...state.audioStats,
          audioLevel: action.audioLevel,
        },
      };
    }
    case "audio-stats": {
      const mergedStats = {
        ...action.stats,
        audioLevel: action.stats.audioLevel ?? state.audioStats.audioLevel,
      };
      if (audioStatsEqual(state.audioStats, mergedStats)) {
        return state;
      }
      return {
        ...state,
        audioStats: mergedStats,
      };
    }
    case "ice-candidate":
      return {
        ...state,
        iceCandidateStats: incrementIceCandidateStats(state.iceCandidateStats ?? EMPTY_ICE_CANDIDATE_STATS, action.candidate),
      };
    case "signaling-timing":
      return {
        ...state,
        signalingTimings: {
          ...state.signalingTimings,
          [action.stage]: Math.max(0, Math.round(action.latencyMs)),
        },
      };
  }
}
