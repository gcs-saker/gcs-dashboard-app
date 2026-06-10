import { useCallback, useRef, useState } from "react";

import { WEBRTC_ICE_SERVERS } from "../../../config";
import { loadWebRtcIceServers } from "../iceServers";
import { talkbackWhipUrl } from "../talkbackRoutes";

type PeerConnectionFactory = () => RTCPeerConnection;

export type TalkbackPublisherStatus = "idle" | "requesting-mic" | "publishing" | "active" | "error";

export interface TalkbackTargetState {
  streamId: string;
  status: "pending" | "active" | "error";
  errorMessage: string | null;
}

export interface UseWhipAudioPublisherOptions {
  mediaDevices?: MediaDevices;
  peerConnectionFactory?: PeerConnectionFactory;
  fetcher?: typeof fetch;
  operatorId?: string;
}

export interface TalkbackPublisherSnapshot {
  status: TalkbackPublisherStatus;
  errorMessage: string | null;
  targets: TalkbackTargetState[];
  start: (streamIds: string[]) => Promise<void>;
  stop: () => void;
}

const ICE_GATHERING_TIMEOUT_MS = 5_000;
const TALKBACK_AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
});

export function useWhipAudioPublisher({
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory,
  fetcher = fetch,
  operatorId,
}: UseWhipAudioPublisherOptions = {}): TalkbackPublisherSnapshot {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<RTCPeerConnection[]>([]);
  const [status, setStatus] = useState<TalkbackPublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [targets, setTargets] = useState<TalkbackTargetState[]>([]);

  const stop = useCallback((): void => {
    peerConnectionsRef.current.forEach((peerConnection) => peerConnection.close());
    peerConnectionsRef.current = [];
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setStatus("idle");
    setErrorMessage(null);
    setTargets([]);
  }, []);

  const start = useCallback(async (streamIds: string[]): Promise<void> => {
    const uniqueStreamIds = Array.from(new Set(streamIds.filter(Boolean)));
    if (uniqueStreamIds.length === 0) {
      setStatus("error");
      setErrorMessage("talkback 대상 stream을 선택해야 합니다.");
      setTargets([]);
      return;
    }
    if (!mediaDevices?.getUserMedia) {
      setStatus("error");
      setErrorMessage("이 브라우저에서는 마이크 송신을 지원하지 않습니다.");
      setTargets([]);
      return;
    }

    stop();
    setStatus("requesting-mic");
    setTargets(uniqueStreamIds.map((streamId) => ({ streamId, status: "pending", errorMessage: null })));

    try {
      const localStream = await mediaDevices.getUserMedia({ audio: TALKBACK_AUDIO_CONSTRAINTS, video: false });
      localStreamRef.current = localStream;
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error("마이크 audio track을 얻지 못했습니다.");
      }

      setStatus("publishing");
      const iceServers = peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(fetcher);
      const results = await Promise.all(uniqueStreamIds.map((streamId) =>
        publishTalkbackTarget({
          audioTracks,
          fetcher,
          iceServers,
          operatorId,
          peerConnectionFactory,
          streamId,
        }),
      ));
      peerConnectionsRef.current = results.flatMap((result) => result.peerConnection ? [result.peerConnection] : []);
      setTargets(results.map(({ peerConnection: _peerConnection, ...target }) => target));
      const failedTargets = results.filter((result) => result.status === "error");
      if (failedTargets.length > 0 && failedTargets.length === results.length) {
        throw new Error("선택한 모든 stream에 talkback 송신을 시작하지 못했습니다.");
      }
      setErrorMessage(failedTargets.length > 0 ? `${failedTargets.length}개 대상 송신 실패` : null);
      setStatus("active");
    } catch (error) {
      peerConnectionsRef.current.forEach((peerConnection) => peerConnection.close());
      peerConnectionsRef.current = [];
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "talkback 송신에 실패했습니다.");
    }
  }, [fetcher, mediaDevices, operatorId, peerConnectionFactory, stop]);

  return { status, errorMessage, targets, start, stop };
}

interface PublishTalkbackTargetOptions {
  audioTracks: MediaStreamTrack[];
  fetcher: typeof fetch;
  iceServers: RTCIceServer[];
  operatorId?: string;
  peerConnectionFactory?: PeerConnectionFactory;
  streamId: string;
}

async function publishTalkbackTarget({
  audioTracks,
  fetcher,
  iceServers,
  operatorId,
  peerConnectionFactory,
  streamId,
}: PublishTalkbackTargetOptions): Promise<TalkbackTargetState & { peerConnection: RTCPeerConnection | null }> {
  let peerConnection: RTCPeerConnection | null = null;
  try {
    peerConnection = peerConnectionFactory?.() ?? new RTCPeerConnection({ iceServers });
    for (const track of audioTracks) {
      peerConnection.addTrack(track);
    }
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);
    const sdp = peerConnection.localDescription?.sdp;
    if (!sdp) {
      throw new Error("talkback WebRTC offer SDP가 생성되지 않았습니다.");
    }
    const response = await fetcher(talkbackWhipUrl(streamId, operatorId), {
      method: "POST",
      headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
      body: sdp,
    });
    if (!response.ok) {
      throw new Error(`talkback WHIP failed with ${response.status}`);
    }
    await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
    return { streamId, status: "active", errorMessage: null, peerConnection };
  } catch (error) {
    peerConnection?.close();
    return {
      streamId,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "talkback 송신 실패",
      peerConnection: null,
    };
  }
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let resolved = false;
    const previousHandler = peerConnection.onicegatheringstatechange;
    const timeoutId = window.setTimeout(resolveOnce, timeoutMs);

    function resolveOnce(): void {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      peerConnection.onicegatheringstatechange = previousHandler;
      resolve();
    }

    peerConnection.onicegatheringstatechange = function handleIceGatheringStateChange(event) {
      previousHandler?.call(peerConnection, event);
      if (peerConnection.iceGatheringState === "complete") {
        resolveOnce();
      }
    };
  });
}
