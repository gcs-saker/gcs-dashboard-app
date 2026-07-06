interface CurrentRef<T> {
  current: T;
}

export interface PublisherSessionRefs {
  peerConnectionRef: CurrentRef<RTCPeerConnection | null>;
  reconnectAttemptRef: CurrentRef<number>;
  reconnectTimeoutRef: CurrentRef<number | null>;
  streamRef: CurrentRef<MediaStream | null>;
  videoRef: CurrentRef<HTMLVideoElement | null>;
}

interface ClearPublisherSessionOptions {
  clearTimer?: boolean;
  clearVideo?: boolean;
  resetReconnectAttempt?: boolean;
  stopTracks?: boolean;
}

const DEFAULT_CLEAR_OPTIONS: Required<ClearPublisherSessionOptions> = {
  clearTimer: true,
  clearVideo: true,
  resetReconnectAttempt: true,
  stopTracks: true,
};

export function clearPublisherSession(
  refs: PublisherSessionRefs,
  options: ClearPublisherSessionOptions = {},
): void {
  const resolved = { ...DEFAULT_CLEAR_OPTIONS, ...options };
  if (resolved.clearTimer) {
    clearPublisherReconnectTimer(refs.reconnectTimeoutRef);
  }
  if (resolved.resetReconnectAttempt) {
    refs.reconnectAttemptRef.current = 0;
  }
  closePublisherPeerConnection(refs.peerConnectionRef);
  if (resolved.stopTracks) {
    stopPublisherMediaStream(refs.streamRef);
  }
  if (resolved.clearVideo) {
    clearPublisherVideoElement(refs.videoRef);
  }
}

export function clearPublisherReconnectTimer(reconnectTimeoutRef: CurrentRef<number | null>): void {
  if (reconnectTimeoutRef.current === null) {
    return;
  }
  window.clearTimeout(reconnectTimeoutRef.current);
  reconnectTimeoutRef.current = null;
}

export function closePublisherPeerConnection(peerConnectionRef: CurrentRef<RTCPeerConnection | null>): void {
  peerConnectionRef.current?.close();
  peerConnectionRef.current = null;
}

function stopPublisherMediaStream(streamRef: CurrentRef<MediaStream | null>): void {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}

function clearPublisherVideoElement(videoRef: CurrentRef<HTMLVideoElement | null>): void {
  if (videoRef.current) {
    videoRef.current.srcObject = null;
  }
}
