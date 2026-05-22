import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, RefObject } from "react";

import type { WebRTCPlaybackSnapshot, WebRTCPlaybackStatus } from "../types";

type PeerConnectionFactory = () => RTCPeerConnection;

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
  | { type: "connection"; connectionState: RTCPeerConnectionState; iceConnectionState: RTCIceConnectionState };

const initialPlaybackState: WebRTCPlaybackSnapshot = {
  status: "idle",
  connectionState: "new",
  iceConnectionState: "new",
  errorMessage: null,
};

export function useWhepPlayback({
  whepUrl,
  isOnline = true,
  peerConnectionFactory = createPeerConnection,
  fetcher = fetch,
}: UseWhepPlaybackOptions): WebRTCPlaybackSnapshot & { videoRef: RefObject<HTMLVideoElement | null> } {
  const videoRef = useRef<HTMLVideoElement>(null);
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

    let peerConnection: RTCPeerConnection;
    const abortController = new AbortController();
    let disposed = false;

    try {
      peerConnection = peerConnectionFactory();
    } catch (error) {
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
      const [stream] = event.streams;
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    };

    peerConnection.onconnectionstatechange = () => {
      dispatchStateFromConnection(peerConnection, dispatch);
    };

    peerConnection.oniceconnectionstatechange = () => {
      dispatchStateFromConnection(peerConnection, dispatch);
    };

    void connectWithWhep(peerConnection, whepUrl, fetcher, abortController.signal).catch((error) => {
      if (disposed || abortController.signal.aborted) {
        return;
      }
      dispatch({
        type: "error",
        message: error instanceof Error ? error.message : "WebRTC playback failed",
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
      });
    });

    return () => {
      disposed = true;
      abortController.abort();
      peerConnection.close();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
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
      };
    case "playing":
      return {
        status: "playing",
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
        errorMessage: null,
      };
    case "offline":
      return {
        status: "offline",
        connectionState: "closed",
        iceConnectionState: "closed",
        errorMessage: null,
      };
    case "unsupported":
      return {
        status: "error",
        connectionState: "unsupported",
        iceConnectionState: "unsupported",
        errorMessage: action.message,
      };
    case "error":
      return {
        status: "error",
        connectionState: action.connectionState ?? state.connectionState,
        iceConnectionState: action.iceConnectionState ?? state.iceConnectionState,
        errorMessage: action.message,
      };
    case "connection":
      return {
        ...state,
        status: statusFromConnection(action.connectionState, action.iceConnectionState, state.status),
        connectionState: action.connectionState,
        iceConnectionState: action.iceConnectionState,
      };
  }
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

  if (connectionState === "failed" || iceConnectionState === "failed") {
    dispatch({
      type: "error",
      message: "WebRTC connection failed",
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

  if (connectionState === "failed" || iceConnectionState === "failed") {
    return "error";
  }

  return fallbackStatus === "idle" ? "loading" : fallbackStatus;
}

async function connectWithWhep(
  peerConnection: RTCPeerConnection,
  whepUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<void> {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  await waitForIceGatheringComplete(peerConnection);

  const localDescription = peerConnection.localDescription;
  if (!localDescription?.sdp) {
    throw new Error("WebRTC local offer SDP was not created");
  }

  const response = await fetcher(whepUrl, {
    method: "POST",
    headers: {
      Accept: "application/sdp",
      "Content-Type": "application/sdp",
    },
    body: localDescription.sdp,
    signal,
  });

  if (!response.ok) {
    throw new Error(`WHEP request failed with ${response.status}`);
  }

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      }
    };
  });
}

function createPeerConnection(): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is not supported");
  }

  return new RTCPeerConnection();
}
