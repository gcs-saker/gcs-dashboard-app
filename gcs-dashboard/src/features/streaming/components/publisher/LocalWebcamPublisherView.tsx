import type { RefObject } from "react";
import type {
  AudioCaptureMode,
  PublisherDeviceStatus,
  PublisherGpsStatus,
  PublisherStepId,
  PublisherStepState,
  PublisherStreamTarget,
  WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";
import { getGpsStatusLabel, getStatusDetail, getStatusLabel } from "@streaming/publisher/publisherStatusPresentation";
import { LocalWebcamPublisherControls } from "./LocalWebcamPublisherControls";
import { TalkbackAudioReceiver } from "@streaming/components/TalkbackAudioReceiver";

interface PublisherStepView {
  id: PublisherStepId;
  index: number;
  label: string;
  state: PublisherStepState;
}

export interface LocalWebcamPublisherViewProps {
  audioInputs: MediaDeviceInfo[];
  audioMode: AudioCaptureMode;
  deviceStatus: PublisherDeviceStatus;
  errorMessage: string | null;
  gpsDetail: string;
  gpsStatus: PublisherGpsStatus;
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
  selectedWhipUrl: string;
  status: WebcamPublisherStatus;
  steps: PublisherStepView[];
  streamTargets: PublisherStreamTarget[];
  videoInputs: MediaDeviceInfo[];
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function LocalWebcamPublisherView(props: LocalWebcamPublisherViewProps) {
  return (
    <main className="local-webcam-publisher" aria-label="Local webcam WebRTC test publisher">
      <header className="local-webcam-publisher__header">
        <h1>로컬 웹캠 송출</h1>
        <span className="local-webcam-publisher__badge" role="status" aria-live="polite">{getStatusLabel(props.status)}</span>
        <span className="local-webcam-publisher__stream">{props.selectedStreamTarget.id}</span>
        <span className="local-webcam-publisher__whip">{props.selectedWhipUrl}</span>
      </header>
      <ol className="local-webcam-publisher__steps" aria-label="WebRTC 송출 단계">
        {props.steps.map((step) => (
          <li key={step.id} className={`local-webcam-publisher__step local-webcam-publisher__step--${step.state}`} aria-current={step.state === "active" ? "step" : undefined}>
            <span className="local-webcam-publisher__step-index">{step.index}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      <LocalWebcamPublisherControls
        audioInputs={props.audioInputs}
        audioMode={props.audioMode}
        deviceStatus={props.deviceStatus}
        onAudioDeviceChange={props.onAudioDeviceChange}
        onAudioModeChange={props.onAudioModeChange}
        onPublish={props.onPublish}
        onRefreshMediaDevices={props.onRefreshMediaDevices}
        onStartPreview={props.onStartPreview}
        onStop={props.onStop}
        onStreamTargetChange={props.onStreamTargetChange}
        onVideoDeviceChange={props.onVideoDeviceChange}
        selectedAudioDeviceId={props.selectedAudioDeviceId}
        selectedStreamTarget={props.selectedStreamTarget}
        selectedVideoDeviceId={props.selectedVideoDeviceId}
        status={props.status}
        streamTargets={props.streamTargets}
        videoInputs={props.videoInputs}
      />
      <video ref={props.videoRef} className="local-webcam-publisher__video" aria-label="Local camera preview" autoPlay muted playsInline />
      <p className="local-webcam-publisher__status-detail" aria-live="polite">{getStatusDetail(props.status)}</p>
      <p className={`local-webcam-publisher__gps local-webcam-publisher__gps--${props.gpsStatus}`} aria-live="polite">
        GPS: {getGpsStatusLabel(props.gpsStatus)} / {props.gpsDetail}
      </p>
      <TalkbackAudioReceiver streamId={props.selectedStreamTarget.id} />
      {props.errorMessage ? <p className="local-webcam-publisher__error">{props.errorMessage}</p> : null}
    </main>
  );
}
