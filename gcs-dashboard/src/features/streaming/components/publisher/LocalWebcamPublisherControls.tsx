import {
  type AudioCaptureMode,
  type PublisherDeviceStatus,
  type PublisherStreamTarget,
  type WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";
import { PublisherActionButtons } from "./PublisherActionButtons";
import { PublisherAudioModeField } from "./PublisherAudioModeField";
import { PublisherDeviceField } from "./PublisherDeviceField";
import { PublisherTargetField } from "./PublisherTargetField";

interface LocalWebcamPublisherControlsProps {
  audioInputs: MediaDeviceInfo[];
  audioMode: AudioCaptureMode;
  deviceStatus: PublisherDeviceStatus;
  onAudioDeviceChange: (deviceId: string) => void;
  onAudioModeChange: (mode: AudioCaptureMode) => void;
  onPublish: () => void;
  onRefreshMediaDevices: () => void;
  onStartPreview: () => void;
  onStop: () => void;
  onStreamTargetChange: (streamId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
  selectedAudioDeviceId: string;
  selectedStreamTarget: PublisherStreamTarget;
  selectedVideoDeviceId: string;
  status: WebcamPublisherStatus;
  streamTargets: PublisherStreamTarget[];
  videoInputs: MediaDeviceInfo[];
}

export function LocalWebcamPublisherControls({
  audioInputs,
  audioMode,
  deviceStatus,
  onAudioDeviceChange,
  onAudioModeChange,
  onPublish,
  onRefreshMediaDevices,
  onStartPreview,
  onStop,
  onStreamTargetChange,
  onVideoDeviceChange,
  selectedAudioDeviceId,
  selectedStreamTarget,
  selectedVideoDeviceId,
  status,
  streamTargets,
  videoInputs,
}: LocalWebcamPublisherControlsProps) {
  return (
    <>
      <PublisherActionButtons
        onPublish={onPublish}
        onStartPreview={onStartPreview}
        onStop={onStop}
        status={status}
      />
      <PublisherTargetField
        onStreamTargetChange={onStreamTargetChange}
        selectedStreamTarget={selectedStreamTarget}
        status={status}
        streamTargets={streamTargets}
      />
      <PublisherDeviceField
        audioInputs={audioInputs}
        deviceStatus={deviceStatus}
        onAudioDeviceChange={onAudioDeviceChange}
        onRefreshMediaDevices={onRefreshMediaDevices}
        onVideoDeviceChange={onVideoDeviceChange}
        selectedAudioDeviceId={selectedAudioDeviceId}
        selectedVideoDeviceId={selectedVideoDeviceId}
        status={status}
        videoInputs={videoInputs}
      />
      <PublisherAudioModeField
        audioMode={audioMode}
        onAudioModeChange={onAudioModeChange}
        status={status}
      />
    </>
  );
}
