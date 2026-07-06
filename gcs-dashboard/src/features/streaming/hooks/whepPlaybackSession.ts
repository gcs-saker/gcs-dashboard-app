import type { Dispatch } from "react";

import { WEBRTC_ICE_SERVERS } from "@/config";
import { loadWebRtcIceServers } from "@streaming/iceServers";
import { monitorAudioStats } from "./whepPlaybackAudio";
import type {
  PlaybackAction,
  PeerConnectionFactory,
  SignalingTimingRecorder,
} from "./whepPlaybackContracts";
import { messageFromUnknown, reportWhepDebug } from "./whepPlaybackDebug";
import {
  connectWithWhep,
  createPeerConnection,
  dispatchStateFromConnection,
} from "./whepPlaybackConnection";
import {
  createWhepTrackHandler,
  type WhepPlaybackMediaRefs,
} from "./whepPlaybackTrack";

type StopMonitor = () => void;

export interface WhepPlaybackSession {
  peerConnection: RTCPeerConnection | null;
  stopAudioMonitor: StopMonitor | null;
  stopAudioLevelMonitor: StopMonitor | null;
  stopAudioStatsMonitor: StopMonitor | null;
}

interface StartWhepPlaybackSessionInput {
  whepUrl: string;
  fetcher: typeof fetch;
  peerConnectionFactory?: PeerConnectionFactory;
  dispatch: Dispatch<PlaybackAction>;
  signal: AbortSignal;
  recordTiming: SignalingTimingRecorder;
  refs: WhepPlaybackMediaRefs;
  session: WhepPlaybackSession;
}

export function createWhepPlaybackSession(): WhepPlaybackSession {
  return {
    peerConnection: null,
    stopAudioMonitor: null,
    stopAudioLevelMonitor: null,
    stopAudioStatsMonitor: null,
  };
}

export async function startWhepPlaybackSession({
  whepUrl,
  fetcher,
  peerConnectionFactory,
  dispatch,
  signal,
  recordTiming,
  refs,
  session,
}: StartWhepPlaybackSessionInput): Promise<void> {
  reportWhepDebug("start", whepUrl);
  const iceServers = peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(fetcher);
  if (signal.aborted) return;
  recordTiming("iceServersLoadedMs");
  reportWhepDebug("ice-loaded", whepUrl, { count: String(iceServers.length) });

  const peerConnection = createSessionPeerConnection(whepUrl, iceServers, peerConnectionFactory, dispatch);
  if (!peerConnection) return;
  session.peerConnection = peerConnection;

  dispatch({
    type: "loading",
    connectionState: peerConnection.connectionState,
    iceConnectionState: peerConnection.iceConnectionState,
  });

  peerConnection.addTransceiver("video", { direction: "recvonly" });
  peerConnection.addTransceiver("audio", { direction: "recvonly" });
  peerConnection.ontrack = createWhepTrackHandler(refs, session, dispatch);
  peerConnection.onconnectionstatechange = () => dispatchStateFromConnection(peerConnection, dispatch);
  peerConnection.oniceconnectionstatechange = () => dispatchStateFromConnection(peerConnection, dispatch);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      dispatch({ type: "ice-candidate", candidate: event.candidate });
    }
  };

  session.stopAudioStatsMonitor = monitorAudioStats(peerConnection, dispatch);
  await connectWithWhep(peerConnection, whepUrl, fetcher, signal, recordTiming);
}

export function stopWhepPlaybackSession(
  session: WhepPlaybackSession,
  refs: WhepPlaybackMediaRefs,
): void {
  session.peerConnection?.close();
  session.stopAudioMonitor?.();
  session.stopAudioLevelMonitor?.();
  session.stopAudioStatsMonitor?.();
  if (refs.videoRef.current) {
    refs.videoRef.current.srcObject = null;
  }
  refs.remoteStreamRef.current = null;
}

function createSessionPeerConnection(
  whepUrl: string,
  iceServers: RTCIceServer[],
  peerConnectionFactory: PeerConnectionFactory | undefined,
  dispatch: Dispatch<PlaybackAction>,
): RTCPeerConnection | null {
  try {
    const peerConnection = peerConnectionFactory?.() ?? createPeerConnection(iceServers, whepUrl);
    reportWhepDebug("pc-created", whepUrl);
    return peerConnection;
  } catch (error) {
    reportWhepDebug("pc-error", whepUrl, { message: messageFromUnknown(error) });
    dispatch({
      type: "unsupported",
      message: error instanceof Error ? error.message : "WebRTC is not supported",
    });
    return null;
  }
}
