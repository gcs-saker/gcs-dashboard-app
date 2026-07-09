import {
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_MICROPHONE_DEVICE_ID,
  FRONT_CAMERA_DEVICE_ID,
  NO_MICROPHONE_DEVICE_ID,
  REAR_CAMERA_DEVICE_ID,
  type PublisherDeviceStatus,
  type WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";
import {
  getDeviceStatusDetail,
  isBusy,
} from "@streaming/publisher/publisherStatusPresentation";

interface PublisherDeviceFieldProps {
  audioInputs: MediaDeviceInfo[];
  deviceStatus: PublisherDeviceStatus;
  onAudioDeviceChange: (deviceId: string) => void;
  onRefreshMediaDevices: () => void;
  onVideoDeviceChange: (deviceId: string) => void;
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  status: WebcamPublisherStatus;
  videoInputs: MediaDeviceInfo[];
}

export function PublisherDeviceField({
  audioInputs,
  deviceStatus,
  onAudioDeviceChange,
  onRefreshMediaDevices,
  onVideoDeviceChange,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  status,
  videoInputs,
}: PublisherDeviceFieldProps) {
  return (
    <fieldset className="local-webcam-publisher__field-group" disabled={isBusy(status)}>
      <legend>입력 장치</legend>
      <label>
        카메라
        <select
          aria-label="카메라 입력 선택"
          onChange={(event) => onVideoDeviceChange(event.currentTarget.value)}
          value={selectedVideoDeviceId}
        >
          <option value={DEFAULT_CAMERA_DEVICE_ID}>기본 카메라</option>
          <option value={FRONT_CAMERA_DEVICE_ID}>전면 카메라 요청</option>
          <option value={REAR_CAMERA_DEVICE_ID}>후면 카메라 요청</option>
          {videoInputs.map((device, index) => (
            <option key={device.deviceId || `video-${index}`} value={device.deviceId}>
              {device.label || `카메라 ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        마이크
        <select
          aria-label="마이크 입력 선택"
          onChange={(event) => onAudioDeviceChange(event.currentTarget.value)}
          value={selectedAudioDeviceId}
        >
          <option value={DEFAULT_MICROPHONE_DEVICE_ID}>기본 마이크</option>
          <option value={NO_MICROPHONE_DEVICE_ID}>마이크 끄기</option>
          {audioInputs.map((device, index) => (
            <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>
              {device.label || `마이크 ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={onRefreshMediaDevices}>
        장치 새로고침
      </button>
      <span>{getDeviceStatusDetail(deviceStatus, videoInputs.length, audioInputs.length)}</span>
    </fieldset>
  );
}
