import { useCallback, useRef, useState } from "react";

import { WEBRTC_ICE_SERVERS } from "@/config";
import { loadWebRtcIceServers } from "@streaming/protocol/iceServers";
import { TALKBACK_AUDIO_CONSTRAINTS, type TalkbackPublisherSnapshot, type TalkbackPublisherStatus,
  type TalkbackTargetState, type UseWhipAudioPublisherOptions } from "@streaming/talkback/talkbackPublisherContracts";
import { monitorLocalMicLevel } from "@streaming/talkback/talkbackMicLevel";
import { publishTalkbackTarget } from "@streaming/talkback/talkbackWhipSession";

export type { UseWhipAudioPublisherOptions } from "@streaming/talkback/talkbackPublisherContracts";

export function useWhipAudioPublisher(options: UseWhipAudioPublisherOptions = {}): TalkbackPublisherSnapshot {
  const runtime = useTalkbackRuntime();
  const { mediaDevices = navigator.mediaDevices, peerConnectionFactory, fetcher = fetch, operatorId } = options;
  const start = useCallback(async (streamIds: string[]): Promise<void> => {
    await startTalkback(runtime, streamIds, { mediaDevices, peerConnectionFactory, fetcher, operatorId });
  }, [fetcher, mediaDevices, operatorId, peerConnectionFactory, runtime]);
  return { status: runtime.status, errorMessage: runtime.errorMessage,
    hasLocalAudioTrack: runtime.hasLocalAudioTrack, micLevel: runtime.micLevel,
    targets: runtime.targets, start, stop: runtime.stop };
}

function useTalkbackRuntime() {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<RTCPeerConnection[]>([]);
  const stopMicLevelMonitorRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<TalkbackPublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLocalAudioTrack, setHasLocalAudioTrack] = useState(false);
  const [micLevel, setMicLevel] = useState<number | null>(null);
  const [targets, setTargets] = useState<TalkbackTargetState[]>([]);
  const releaseResources = useCallback(() => {
    peerConnectionsRef.current.forEach((connection) => connection.close());
    peerConnectionsRef.current = [];
    stopMicLevelMonitorRef.current?.(); stopMicLevelMonitorRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop()); localStreamRef.current = null;
    setHasLocalAudioTrack(false); setMicLevel(null);
  }, []);
  const stop = useCallback(() => {
    releaseResources(); setStatus("idle"); setErrorMessage(null); setTargets([]);
  }, [releaseResources]);
  return { errorMessage, hasLocalAudioTrack, localStreamRef, micLevel, peerConnectionsRef, releaseResources,
    setErrorMessage, setHasLocalAudioTrack, setMicLevel, setStatus, setTargets, status,
    stop, stopMicLevelMonitorRef, targets };
}

type TalkbackRuntime = ReturnType<typeof useTalkbackRuntime>;

async function startTalkback(
  runtime: TalkbackRuntime,
  streamIds: string[],
  options: Required<Pick<UseWhipAudioPublisherOptions, "fetcher">> & Omit<UseWhipAudioPublisherOptions, "fetcher">,
): Promise<void> {
  const targets = Array.from(new Set(streamIds.filter(Boolean)));
  if (!validateTalkbackStart(runtime, targets, options.mediaDevices)) return;
  runtime.stop(); runtime.setStatus("requesting-mic");
  runtime.setTargets(targets.map((streamId) => ({ streamId, status: "pending", errorMessage: null })));
  try {
    const stream = await options.mediaDevices!.getUserMedia({ audio: TALKBACK_AUDIO_CONSTRAINTS, video: false });
    runtime.localStreamRef.current = stream;
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) throw new Error("마이크 audio track을 얻지 못했습니다.");
    runtime.setHasLocalAudioTrack(true);
    runtime.stopMicLevelMonitorRef.current = monitorLocalMicLevel(stream, runtime.setMicLevel);
    runtime.setStatus("publishing");
    const iceServers = options.peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(options.fetcher);
    const results = await Promise.all(targets.map((streamId) => publishTalkbackTarget({
      audioTracks, fetcher: options.fetcher, iceServers, operatorId: options.operatorId,
      peerConnectionFactory: options.peerConnectionFactory, streamId,
    })));
    runtime.peerConnectionsRef.current = results.flatMap((result) => result.peerConnection ? [result.peerConnection] : []);
    runtime.setTargets(results.map(({ peerConnection: _connection, ...target }) => target));
    const failures = results.filter((result) => result.status === "error");
    if (failures.length === results.length) throw new Error("선택한 모든 stream에 talkback 송신을 시작하지 못했습니다.");
    runtime.setErrorMessage(failures.length ? `${failures.length}개 대상 송신 실패` : null);
    runtime.setStatus("active");
  } catch (error) {
    runtime.releaseResources(); runtime.setStatus("error");
    runtime.setErrorMessage(error instanceof Error ? error.message : "talkback 송신에 실패했습니다.");
  }
}

function validateTalkbackStart(runtime: TalkbackRuntime, targets: string[], mediaDevices?: MediaDevices): boolean {
  if (targets.length === 0) {
    runtime.setStatus("error"); runtime.setErrorMessage("talkback 대상 stream을 선택해야 합니다."); runtime.setTargets([]);
    return false;
  }
  if (!mediaDevices?.getUserMedia) {
    runtime.setStatus("error"); runtime.setErrorMessage("이 브라우저에서는 마이크 송신을 지원하지 않습니다."); runtime.setTargets([]);
    return false;
  }
  return true;
}
