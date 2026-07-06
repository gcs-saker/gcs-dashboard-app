export type TalkbackPeerConnectionFactory = () => RTCPeerConnection;

export type TalkbackPublisherStatus = "idle" | "requesting-mic" | "publishing" | "active" | "error";

export interface TalkbackTargetState {
  streamId: string;
  status: "pending" | "active" | "error";
  errorMessage: string | null;
}

export interface UseWhipAudioPublisherOptions {
  mediaDevices?: MediaDevices;
  peerConnectionFactory?: TalkbackPeerConnectionFactory;
  fetcher?: typeof fetch;
  operatorId?: string;
}

export interface TalkbackPublisherSnapshot {
  status: TalkbackPublisherStatus;
  errorMessage: string | null;
  hasLocalAudioTrack: boolean;
  micLevel: number | null;
  targets: TalkbackTargetState[];
  start: (streamIds: string[]) => Promise<void>;
  stop: () => void;
}

export const TALKBACK_AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
});
