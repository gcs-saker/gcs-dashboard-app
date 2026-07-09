import type {
  AudioCaptureMode,
  WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";
import {
  getAudioModeDetail,
  isBusy,
} from "@streaming/publisher/publisherStatusPresentation";

interface PublisherAudioModeFieldProps {
  audioMode: AudioCaptureMode;
  onAudioModeChange: (mode: AudioCaptureMode) => void;
  status: WebcamPublisherStatus;
}

export function PublisherAudioModeField({
  audioMode,
  onAudioModeChange,
  status,
}: PublisherAudioModeFieldProps) {
  return (
    <fieldset className="local-webcam-publisher__audio-mode" disabled={isBusy(status)}>
      <legend>음성 처리</legend>
      <label>
        <input
          checked={audioMode === "low-latency"}
          name="audio-mode"
          onChange={() => onAudioModeChange("low-latency")}
          type="radio"
          value="low-latency"
        />
        저지연
      </label>
      <label>
        <input
          checked={audioMode === "quality"}
          name="audio-mode"
          onChange={() => onAudioModeChange("quality")}
          type="radio"
          value="quality"
        />
        음질
      </label>
      <span>{getAudioModeDetail(audioMode)}</span>
    </fieldset>
  );
}
