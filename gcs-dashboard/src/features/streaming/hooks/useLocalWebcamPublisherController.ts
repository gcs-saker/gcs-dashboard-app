import { useCallback, useEffect, useMemo } from "react";
import { LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL } from "@/config";
import { usePublisherGpsTelemetry } from "./usePublisherGpsTelemetry";
import { usePublisherMediaDevices } from "./usePublisherMediaDevices";
import { RECONNECT_DELAYS_MS, type WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { audioCaptureConstraints, videoCaptureConstraints } from "@streaming/publisher/publisherMediaConstraints";
import { isPublishedConnectionDisconnected } from "@streaming/publisher/publisherConnectionState";
import { clearPublisherReconnectTimer, clearPublisherSession, closePublisherPeerConnection } from "@streaming/publisher/publisherSessionCleanup";
import { getPublisherSteps } from "@streaming/publisher/publisherStatusPresentation";
import { buildWhipUrl, DEFAULT_STREAM_TARGETS, ensureStreamTargets } from "@streaming/publisher/publisherTargets";
import { PublisherWhipSessionError, startPublisherWhipSession } from "@streaming/publisher/publisherWhipSession";
import type { LocalWebcamPublisherViewProps } from "@streaming/components/publisher/LocalWebcamPublisherView";
import { useLocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";
import { useLocalWebcamPublisherViewProps } from "./useLocalWebcamPublisherViewProps";

export interface LocalWebcamPublisherProps {
  streamId?: string;
  whipUrl?: string;
  mediaDevices?: MediaDevices;
  peerConnectionFactory?: () => RTCPeerConnection;
  fetcher?: typeof fetch;
  geolocation?: Geolocation;
}

export function useLocalWebcamPublisherController({
  streamId = LOCAL_WEBCAM_STREAM_ID,
  whipUrl = LOCAL_WEBCAM_WHIP_URL,
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory,
  fetcher = fetch,
  geolocation = navigator.geolocation,
}: LocalWebcamPublisherProps): LocalWebcamPublisherViewProps {
  const runtime = useLocalWebcamPublisherRuntime(streamId);
  const streamTargets = useMemo(() => ensureStreamTargets(DEFAULT_STREAM_TARGETS, streamId, whipUrl), [streamId, whipUrl]);
  const { audioInputs, deviceStatus, refreshMediaDevices, videoInputs } = usePublisherMediaDevices(mediaDevices);
  const selectedStreamTarget = useMemo(() => streamTargets.find((target) => target.id === runtime.selectedStreamId) ?? streamTargets[0], [runtime.selectedStreamId, streamTargets]);
  const selectedWhipUrl = useMemo(() => buildWhipUrl(whipUrl, selectedStreamTarget.whipPath), [selectedStreamTarget.whipPath, whipUrl]);
  const { gpsDetail, gpsStatus, startGpsTelemetry, stopGpsTelemetry } = usePublisherGpsTelemetry({ fetcher, geolocation, streamId: selectedStreamTarget.id });
  const steps = useMemo(() => getPublisherSteps(runtime.status, runtime.failedStep), [runtime.failedStep, runtime.status]);

  const updateStatus = useCallback((nextStatus: WebcamPublisherStatus): void => {
    runtime.statusRef.current = nextStatus;
    runtime.setStatus(nextStatus);
  }, [runtime]);
  const clearReconnectTimer = useCallback((): void => clearPublisherReconnectTimer(runtime.reconnectTimeoutRef), [runtime.reconnectTimeoutRef]);
  const stopAll = useCallback((): void => {
    stopGpsTelemetry();
    clearPublisherSession(runtime.sessionRefs);
    updateStatus("idle");
    runtime.setFailedStep(null);
  }, [runtime, stopGpsTelemetry, updateStatus]);

  const scheduleReconnect = useCallback((message: string): void => {
    if (!runtime.streamRef.current || runtime.reconnectTimeoutRef.current !== null) return;
    stopGpsTelemetry();
    closePublisherPeerConnection(runtime.peerConnectionRef);
    const delay = RECONNECT_DELAYS_MS[Math.min(runtime.reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
    runtime.reconnectAttemptRef.current += 1;
    runtime.setFailedStep("media");
    runtime.setErrorMessage(message);
    updateStatus("reconnecting");
    runtime.reconnectTimeoutRef.current = window.setTimeout(() => {
      runtime.reconnectTimeoutRef.current = null;
      void publish();
    }, delay);
  }, [runtime, stopGpsTelemetry, updateStatus]);

  const handleConnectionChange = useCallback((peerConnection: RTCPeerConnection): void => {
    if (!isPublishedConnectionDisconnected(peerConnection) || runtime.statusRef.current !== "published") return;
    scheduleReconnect(`송출 미디어 연결이 끊겼습니다 (${peerConnection.connectionState}/${peerConnection.iceConnectionState}). 재연결을 시도합니다.`);
  }, [scheduleReconnect]);

  const startPreview = useCallback(async (): Promise<void> => {
    if (!mediaDevices?.getUserMedia) {
      updateStatus("unsupported");
      runtime.setFailedStep("camera");
      runtime.setErrorMessage("이 브라우저에서는 카메라 캡처를 지원하지 않습니다.");
      return;
    }
    try {
      runtime.setFailedStep(null);
      updateStatus("requesting-camera");
      const stream = await mediaDevices.getUserMedia({ video: videoCaptureConstraints(runtime.selectedVideoDeviceId), audio: audioCaptureConstraints(runtime.audioMode, runtime.selectedAudioDeviceId) });
      runtime.streamRef.current = stream;
      if (runtime.videoRef.current) runtime.videoRef.current.srcObject = stream;
      void refreshMediaDevices();
      runtime.setErrorMessage(null);
      updateStatus("previewing");
    } catch (error) {
      updateStatus("error");
      runtime.setFailedStep("camera");
      runtime.setErrorMessage(error instanceof Error ? error.message : "카메라 권한을 받을 수 없습니다.");
    }
  }, [mediaDevices, refreshMediaDevices, runtime, updateStatus]);

  const publish = useCallback(async (): Promise<void> => {
    if (!runtime.streamRef.current) {
      updateStatus("error");
      runtime.setFailedStep("camera");
      runtime.setErrorMessage("송출 전 카메라 미리보기를 먼저 준비해야 합니다.");
      return;
    }
    try {
      clearReconnectTimer();
      closePublisherPeerConnection(runtime.peerConnectionRef);
      runtime.setFailedStep(null);
      await startPublisherWhipSession({ fetcher, mediaStream: runtime.streamRef.current, onConnectionChange: handleConnectionChange, onPeerConnection: (pc) => { runtime.peerConnectionRef.current = pc; }, onStatus: updateStatus, peerConnectionFactory, streamId: selectedStreamTarget.id });
      runtime.setErrorMessage(null);
      runtime.reconnectAttemptRef.current = 0;
      updateStatus("published");
      startGpsTelemetry();
    } catch (error) {
      closePublisherPeerConnection(runtime.peerConnectionRef);
      stopGpsTelemetry();
      updateStatus("error");
      runtime.setFailedStep(error instanceof PublisherWhipSessionError ? error.step : "media");
      runtime.setErrorMessage(error instanceof Error ? error.message : "로컬 웹캠 송출에 실패했습니다.");
    }
  }, [clearReconnectTimer, fetcher, handleConnectionChange, peerConnectionFactory, runtime, selectedStreamTarget.id, startGpsTelemetry, stopGpsTelemetry, updateStatus]);

  const resetCaptureForInputChange = useCallback((): void => {
    if (runtime.statusRef.current !== "idle") {
      stopGpsTelemetry();
      clearPublisherSession(runtime.sessionRefs);
      updateStatus("idle");
    }
    runtime.setFailedStep(null);
    runtime.setErrorMessage(null);
  }, [runtime, stopGpsTelemetry, updateStatus]);

  useEffect(() => {
    if (!streamTargets.some((target) => target.id === runtime.selectedStreamId)) runtime.setSelectedStreamId(streamTargets[0].id);
  }, [runtime, streamTargets]);
  useEffect(() => () => {
    stopGpsTelemetry();
    clearPublisherSession(runtime.sessionRefs);
  }, [runtime.sessionRefs, stopGpsTelemetry]);

  return useLocalWebcamPublisherViewProps({
    audioInputs, deviceStatus, gpsDetail, gpsStatus, onPublish: publish, onRefreshMediaDevices: refreshMediaDevices,
    onResetCapture: resetCaptureForInputChange, onStartPreview: startPreview, onStop: stopAll, runtime,
    selectedStreamTarget, selectedWhipUrl, steps, streamTargets, videoInputs,
  });
}
