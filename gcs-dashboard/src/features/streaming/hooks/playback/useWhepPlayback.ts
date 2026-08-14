import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";

import type { WebRTCPlaybackSnapshot } from "@streaming/types";
import type { PeerConnectionFactory, SignalingTimingRecorder } from "@streaming/hooks/playback/whepPlaybackContracts";
import { initialPlaybackState, playbackReducer } from "@streaming/hooks/playback/whepPlaybackReducer";
import {
  createWhepPlaybackSession,
  startWhepPlaybackSession,
  stopWhepPlaybackSession,
} from "@streaming/hooks/playback/whepPlaybackSession";
import {
  WHEP_CONNECTION_STATE,
  WHEP_PLAYBACK_ACTION,
  WHEP_PLAYBACK_MESSAGE,
} from "@streaming/hooks/playback/whepPlaybackStateContract";

interface UseWhepPlaybackOptions {
  whepUrl: string | null;
  isOnline?: boolean;
  peerConnectionFactory?: PeerConnectionFactory;
  fetcher?: typeof fetch;
}

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
      dispatch({ type: WHEP_PLAYBACK_ACTION.offline });
      return;
    }

    if (!whepUrl) {
      dispatch({ type: WHEP_PLAYBACK_ACTION.error, message: WHEP_PLAYBACK_MESSAGE.missingUrl });
      return;
    }

    const resolvedWhepUrl = whepUrl;
    const abortController = new AbortController();
    const session = createWhepPlaybackSession();
    let disposed = false;
    const startedAt = performance.now();
    const recordTiming: SignalingTimingRecorder = (stage) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: WHEP_PLAYBACK_ACTION.signalingTiming, stage, latencyMs: performance.now() - startedAt });
    };

    const videoElement = videoRef.current;
    const handleFirstFrame = () => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({ type: WHEP_PLAYBACK_ACTION.firstFrame, latencyMs: performance.now() - startedAt });
    };
    videoElement?.addEventListener("loadeddata", handleFirstFrame, { once: true });

    dispatch({
      type: WHEP_PLAYBACK_ACTION.loading,
      connectionState: WHEP_CONNECTION_STATE.new,
      iceConnectionState: WHEP_CONNECTION_STATE.new,
    });

    void startWhepPlaybackSession({
      whepUrl: resolvedWhepUrl,
      fetcher,
      peerConnectionFactory,
      dispatch,
      signal: abortController.signal,
      recordTiming,
      refs: { videoRef, remoteStreamRef },
      session,
    }).catch((error) => {
      if (disposed || abortController.signal.aborted) return;
      dispatch({
        type: WHEP_PLAYBACK_ACTION.error,
        message: error instanceof Error ? error.message : WHEP_PLAYBACK_MESSAGE.failed,
        connectionState: session.peerConnection?.connectionState,
        iceConnectionState: session.peerConnection?.iceConnectionState,
      });
    });

    return () => {
      disposed = true;
      abortController.abort();
      stopWhepPlaybackSession(session, { videoRef, remoteStreamRef });
      videoElement?.removeEventListener("loadeddata", handleFirstFrame);
    };
  }, [fetcher, isOnline, peerConnectionFactory, whepUrl]);

  return { ...snapshot, videoRef };
}
