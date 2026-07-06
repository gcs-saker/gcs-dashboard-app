import { useMemo } from "react";
import type { LocalWebcamPublisherViewProps } from "@streaming/components/publisher/LocalWebcamPublisherView";
import type { PublisherStreamTarget } from "@streaming/publisher/publisherContracts";
import type { useLocalWebcamPublisherRuntime } from "./useLocalWebcamPublisherRuntime";

interface UseLocalWebcamPublisherViewPropsInput {
  audioInputs: MediaDeviceInfo[];
  deviceStatus: LocalWebcamPublisherViewProps["deviceStatus"];
  gpsDetail: string;
  gpsStatus: LocalWebcamPublisherViewProps["gpsStatus"];
  onPublish: () => Promise<void>;
  onRefreshMediaDevices: () => Promise<void>;
  onResetCapture: () => void;
  onStartPreview: () => Promise<void>;
  onStop: () => void;
  runtime: ReturnType<typeof useLocalWebcamPublisherRuntime>;
  selectedStreamTarget: PublisherStreamTarget;
  selectedWhipUrl: string;
  steps: LocalWebcamPublisherViewProps["steps"];
  streamTargets: PublisherStreamTarget[];
  videoInputs: MediaDeviceInfo[];
}

export function useLocalWebcamPublisherViewProps(input: UseLocalWebcamPublisherViewPropsInput): LocalWebcamPublisherViewProps {
  const {
    audioInputs,
    deviceStatus,
    gpsDetail,
    gpsStatus,
    onPublish,
    onRefreshMediaDevices,
    onResetCapture,
    onStartPreview,
    onStop,
    runtime,
    selectedStreamTarget,
    selectedWhipUrl,
    steps,
    streamTargets,
    videoInputs,
  } = input;

  return useMemo(() => ({
    audioInputs,
    audioMode: runtime.audioMode,
    deviceStatus,
    errorMessage: runtime.errorMessage,
    gpsDetail,
    gpsStatus,
    onAudioDeviceChange: (id) => { runtime.setSelectedAudioDeviceId(id); onResetCapture(); },
    onAudioModeChange: (mode) => { runtime.setAudioMode(mode); onResetCapture(); },
    onPublish: () => void onPublish(),
    onRefreshMediaDevices: () => void onRefreshMediaDevices(),
    onStartPreview: () => void onStartPreview(),
    onStop,
    onStreamTargetChange: (id) => { runtime.setSelectedStreamId(id); onResetCapture(); },
    onVideoDeviceChange: (id) => { runtime.setSelectedVideoDeviceId(id); onResetCapture(); },
    selectedAudioDeviceId: runtime.selectedAudioDeviceId,
    selectedStreamTarget,
    selectedVideoDeviceId: runtime.selectedVideoDeviceId,
    selectedWhipUrl,
    status: runtime.status,
    steps,
    streamTargets,
    videoInputs,
    videoRef: runtime.videoRef,
  }), [audioInputs, deviceStatus, gpsDetail, gpsStatus, onPublish, onRefreshMediaDevices, onResetCapture, onStartPreview, onStop, runtime, selectedStreamTarget, selectedWhipUrl, steps, streamTargets, videoInputs]);
}
