import { useCallback, useRef, useState } from "react";

import { WEBRTC_ICE_SERVERS } from "@/config";
import { loadWebRtcIceServers } from "@streaming/protocol/iceServers";
import {
  TALKBACK_AUDIO_CONSTRAINTS,
  type TalkbackPublisherSnapshot,
  type TalkbackPublisherStatus,
  type TalkbackTargetState,
  type UseWhipAudioPublisherOptions,
} from "@streaming/talkback/talkbackPublisherContracts";
import { monitorLocalMicLevel } from "@streaming/talkback/talkbackMicLevel";
import { publishTalkbackTarget } from "@streaming/talkback/talkbackWhipSession";

export type { UseWhipAudioPublisherOptions } from "@streaming/talkback/talkbackPublisherContracts";

export function useWhipAudioPublisher({
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory,
  fetcher = fetch,
  operatorId,
}: UseWhipAudioPublisherOptions = {}): TalkbackPublisherSnapshot {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<RTCPeerConnection[]>([]);
  const stopMicLevelMonitorRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<TalkbackPublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLocalAudioTrack, setHasLocalAudioTrack] = useState(false);
  const [micLevel, setMicLevel] = useState<number | null>(null);
  const [targets, setTargets] = useState<TalkbackTargetState[]>([]);

  const stop = useCallback((): void => {
    peerConnectionsRef.current.forEach((peerConnection) => peerConnection.close());
    peerConnectionsRef.current = [];
    stopMicLevelMonitorRef.current?.();
    stopMicLevelMonitorRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setStatus("idle");
    setErrorMessage(null);
    setHasLocalAudioTrack(false);
    setMicLevel(null);
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
      setHasLocalAudioTrack(true);
      stopMicLevelMonitorRef.current = monitorLocalMicLevel(localStream, setMicLevel);

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
      stopMicLevelMonitorRef.current?.();
      stopMicLevelMonitorRef.current = null;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "talkback 송신에 실패했습니다.");
      setHasLocalAudioTrack(false);
      setMicLevel(null);
    }
  }, [fetcher, mediaDevices, operatorId, peerConnectionFactory, stop]);

  return { status, errorMessage, hasLocalAudioTrack, micLevel, targets, start, stop };
}
