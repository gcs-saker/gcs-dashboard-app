import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, RefObject } from "react";

import { WEBRTC_ICE_SERVERS } from "../../../config";
import { loadWebRtcIceServers } from "../iceServers";
import type { WebRTCPlaybackSnapshot, WebRTCPlaybackStatus, WebRTCSignalingTimings } from "../types";

type PeerConnectionFactory = () => RTCPeerConnection;
type SignalingTimingKey = keyof WebRTCSignalingTimings;
type SignalingTimingRecorder = (stage: SignalingTimingKey) => void;

const ICE_GATHERING_TIMEOUT_MS = 2500;
const AUDIO_STATE_POLL_INTERVAL_MS = 500;
const AUDIO_INACTIVE_HOLD_MS = 1200;
const EMPTY_SIGNALING_TIMINGS: WebRTCSignalingTimings = {
  iceServersLoadedMs: null,
  offerCreatedMs: null,
  localDescriptionSetMs: null,
  iceGatheringDoneMs: null,
  whepResponseMs: null,
  remoteDescriptionSetMs: null,
};

interface UseWhepPlaybackOptions {
  whepUrl: string | null;
  isOnline?: boolean;
  peerConnectionFactory?: PeerConnectionFactory;
  fetcher?: typeof fetch;
}

type PlaybackAction =
  | { type: "loading"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "playing"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "offline" }
  | { type: "unsupported"; message: string }
  | { type: "error"; message: string; connectionState?: RTCPeerConnectionState; iceConnectionState?: RTCIceConnectionState }
  | { type: "connection"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState }
  | { type: "first-frame"; latencyMs: number }
  | { type: "audio-state"; hasAudioTrack: boolean; isAudioActive: boolean }
  | { type: "signaling-timing"; stage: SignalingTimingKey; latencyMs: number };

const initialPlaybackState: WebRTCPlaybackSnapshot = {
  status: "idle",
  connectionState: "new",
  iceConnectionState: "new",
  errorMessage: null,
  hasVideoFrame: false,
  hasAudioTrack: false,
  isAudioActive: false,
  firstFrameLatencyMs: null,
  signalingTimings: EMPTY_SIGNALING_TIMINGS,
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
          stopAudioMonitor = monitorAudioState(stream, dispatch);
          videoRef.current.srcObject = stream;
          requestVideoPlayback(videoRef.current);
          return;
        }

        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
        stopAudioMonitor?.();
        stopAudioMonitor = monitorAudioState(remoteStreamRef.current, dispatch);
        videoRef.current.srcObject = remoteStreamRef.current;
        requestVideoPlayback(videoRef.current);
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

      await connectWithWhep(peerConnection, resolvedWhepUrl, fetcher, abortController.signal, recordTiming);
    }

    return () => {
      disposed = true;
      abortController.abort();
      peerConnection?.close();
      stopAudioMonitor?.();
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
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
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
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
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
        firstFrameLatencyMs: null,
        signalingTimings: EMPTY_SIGNALING_TIMINGS,
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
        firstFrameLatencyMs: null,
        signalingTimings: state.signalingTimings,
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
        firstFrameLatencyMs: state.firstFrameLatencyMs,
        signalingTimings: state.signalingTimings,
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

function monitorAudioState(stream: MediaStream, dispatch: Dispatch<PlaybackAction>): () => void {
  const audioTracks = typeof stream.getAudioTracks === "function" ? stream.getAudioTracks() : [];
  let pendingInactiveTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let lastEmitted = { hasAudioTrack: false, isAudioActive: false };

  const clearPendingInactive = () => {
    if (pendingInactiveTimer === null) return;
    globalThis.clearTimeout(pendingInactiveTimer);
    pendingInactiveTimer = null;
  };
  const emit = (next: { hasAudioTrack: boolean; isAudioActive: boolean }) => {
    if (
      lastEmitted.hasAudioTrack === next.hasAudioTrack &&
      lastEmitted.isAudioActive === next.isAudioActive
    ) {
      return;
    }
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
    if (next.isAudioActive || !next.hasAudioTrack) {
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
  for (const track of audioTracks) {
    track.addEventListener?.("mute", update);
    track.addEventListener?.("unmute", update);
    track.addEventListener?.("ended", update);
  }

  return () => {
    clearPendingInactive();
    globalThis.clearInterval(intervalId);
    for (const track of audioTracks) {
      track.removeEventListener?.("mute", update);
      track.removeEventListener?.("unmute", update);
      track.removeEventListener?.("ended", update);
    }
    dispatch({ type: "audio-state", hasAudioTrack: false, isAudioActive: false });
  };
}

function dispatchStateFromConnection(
  peerConnection: RTCPeerConnection,
  dispatch: Dispatch<PlaybackAction>,
): void {
  const connectionState = peerConnection.connectionState;
  const iceConnectionState = peerConnection.iceConnectionState;

  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    dispatch({ type: "playing", connectionState, iceConnectionState });
    return;
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
    dispatch({
      type: "error",
      message: `WebRTC connection interrupted (${connectionState}/${iceConnectionState})`,
      connectionState,
      iceConnectionState,
    });
    return;
  }

  dispatch({ type: "connection", connectionState, iceConnectionState });
}

function statusFromConnection(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
  fallbackStatus: WebRTCPlaybackStatus,
): WebRTCPlaybackStatus {
  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    return "playing";
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
    return "error";
  }

  return fallbackStatus === "idle" ? "loading" : fallbackStatus;
}

async function connectWithWhep(
  peerConnection: RTCPeerConnection,
  whepUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<void> {
  const offer = await peerConnection.createOffer();
  recordTiming("offerCreatedMs");
  reportWhepDebug("offer-created", whepUrl);
  await peerConnection.setLocalDescription(offer);
  recordTiming("localDescriptionSetMs");
  reportWhepDebug("local-description-set", whepUrl);
  await waitForIceGatheringComplete(peerConnection, signal, ICE_GATHERING_TIMEOUT_MS);
  recordTiming("iceGatheringDoneMs");
  reportWhepDebug("ice-wait-done", whepUrl, { state: peerConnection.iceGatheringState });

  if (signal.aborted) {
    reportWhepDebug("aborted-before-post", whepUrl);
    throw new Error("WebRTC playback was aborted");
  }

  const localDescription = peerConnection.localDescription;
  if (!localDescription?.sdp) {
    reportWhepDebug("missing-local-sdp", whepUrl);
    throw new Error("WebRTC local offer SDP was not created");
  }

  reportWhepDebug("whep-post-start", whepUrl, { candidates: String(countSdpCandidates(localDescription.sdp)) });
  const response = await fetcher(whepUrl, {
    method: "POST",
    headers: {
      Accept: "application/sdp",
      "Content-Type": "application/sdp",
    },
    body: localDescription.sdp,
    signal,
  });
  recordTiming("whepResponseMs");
  reportWhepDebug("whep-post-response", whepUrl, { status: String(response.status) });

  if (!response.ok) {
    throw new Error(`WHEP request failed with ${response.status}`);
  }

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
  recordTiming("remoteDescriptionSetMs");
  reportWhepDebug("remote-description-set", whepUrl, { candidates: String(countSdpCandidates(answerSdp)) });
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let isResolved = false;
    const finish = () => {
      if (isResolved) return;
      isResolved = true;
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      peerConnection.onicegatheringstatechange = null;
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, timeoutMs);

    signal.addEventListener("abort", finish, { once: true });
    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };
  });
}

function createPeerConnection(iceServers: RTCIceServer[], whepUrl: string): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is not supported");
  }

  try {
    return new RTCPeerConnection({ iceServers });
  } catch (primaryError) {
    reportWhepDebug("pc-primary-config-failed", whepUrl, { message: messageFromUnknown(primaryError) });
  }

  try {
    return new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS });
  } catch (fallbackError) {
    reportWhepDebug("pc-fallback-config-failed", whepUrl, { message: messageFromUnknown(fallbackError) });
  }

  return new RTCPeerConnection();
}

function requestVideoPlayback(videoElement: HTMLVideoElement): void {
  try {
    const playResult = videoElement.play();
    void playResult?.catch(() => undefined);
  } catch {
    // Browser autoplay policy can reject programmatic playback; the peer connection still remains valid.
  }
}

function countSdpCandidates(sdp: string): number {
  return sdp.split(/\r?\n/).filter((line) => line.startsWith("a=candidate:")).length;
}

function reportWhepDebug(stage: string, whepUrl: string, fields: Record<string, string> = {}): void {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams({
    stage,
    stream: streamPathFromWhepUrl(whepUrl),
    ...fields,
  });
  const url = `/client-debug/webrtc?${params.toString()}`;

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url);
    }
  } catch {
    // Debug reporting must never interrupt playback.
  }
}

function streamPathFromWhepUrl(whepUrl: string): string {
  try {
    const path = new URL(whepUrl, window.location.href).pathname;
    return path.replace(/^\/webrtc\//, "").replace(/\/whep$/, "");
  } catch {
    return "unknown";
  }
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160);
  return String(error).slice(0, 160);
}
