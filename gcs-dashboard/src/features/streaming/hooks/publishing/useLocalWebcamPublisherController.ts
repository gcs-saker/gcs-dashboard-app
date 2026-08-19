import { useCallback, useEffect, useMemo, useRef } from "react";
import { LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL } from "@/config";
import { usePublisherGpsTelemetry } from "@streaming/hooks/publishing/usePublisherGpsTelemetry";
import { usePublisherMediaDevices } from "@streaming/hooks/publishing/usePublisherMediaDevices";
import type { WebcamPublisherStatus } from "@streaming/publisher/publisherContracts";
import { clearPublisherSession } from "@streaming/publisher/publisherSessionCleanup";
import { getPublisherSteps } from "@streaming/publisher/publisherStatusPresentation";
import { buildWhipUrl, DEFAULT_STREAM_TARGETS, ensureStreamTargets } from "@streaming/publisher/publisherTargets";
import type { LocalWebcamPublisherViewProps } from "@streaming/components/publisher/LocalWebcamPublisherView";
import { useLocalWebcamPublisherRuntime } from "@streaming/hooks/publishing/useLocalWebcamPublisherRuntime";
import { useLocalWebcamPublisherViewProps } from "@streaming/hooks/publishing/useLocalWebcamPublisherViewProps";
import { usePublisherConnectionRecovery } from "@streaming/hooks/publishing/usePublisherConnectionRecovery";
import { usePublisherPreview } from "@streaming/hooks/publishing/usePublisherPreview";
import { usePublisherWhipPublish } from "@streaming/hooks/publishing/usePublisherWhipPublish";

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
  const publishRef = useRef<() => Promise<void>>(async () => undefined);
  const { selectedStreamId, sessionRefs, setSelectedStreamId } = runtime;
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
  const { clearReconnectTimer, handleConnectionChange, resetCapture, stopAll } =
    usePublisherConnectionRecovery(runtime, publishRef, stopGpsTelemetry, updateStatus);
  const startPreview = usePublisherPreview(runtime, mediaDevices, refreshMediaDevices, updateStatus);
  const publish = usePublisherWhipPublish({
    clearReconnectTimer, fetcher, handleConnectionChange, peerConnectionFactory, runtime,
    startGpsTelemetry, stopGpsTelemetry, streamId: selectedStreamTarget.id, updateStatus,
  });
  publishRef.current = publish;

  useEffect(() => {
    if (!streamTargets.some((target) => target.id === selectedStreamId)) setSelectedStreamId(streamTargets[0].id);
  }, [selectedStreamId, setSelectedStreamId, streamTargets]);
  useEffect(() => () => {
    stopGpsTelemetry();
    clearPublisherSession(sessionRefs);
  }, [sessionRefs, stopGpsTelemetry]);

  return useLocalWebcamPublisherViewProps({
    audioInputs, deviceStatus, gpsDetail, gpsStatus, onPublish: publish, onRefreshMediaDevices: refreshMediaDevices,
    onResetCapture: resetCapture, onStartPreview: startPreview, onStop: stopAll, runtime,
    selectedStreamTarget, selectedWhipUrl, steps, streamTargets, videoInputs,
  });
}
