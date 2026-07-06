import { ICE_GATHERING_TIMEOUT_MS, MEDIA_CONNECTION_TIMEOUT_MS } from "./publisherContracts";
import {
  isPublisherPeerConnectionFailed,
  isPublisherPeerConnectionReady,
} from "./publisherWebRtcState";

const MEDIA_CONNECTION_TIMEOUT_MESSAGE = "시그널링은 완료됐지만 WebRTC 미디어 연결이 시간 안에 완료되지 않았습니다.";
const MEDIA_CONNECTION_FAILED_MESSAGE = "WebRTC ICE 미디어 연결이 실패했습니다.";

export function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let isResolved = false;
    const previousHandler = peerConnection.onicegatheringstatechange;
    const timeoutId = window.setTimeout(resolveOnce, timeoutMs);

    function resolveOnce(): void {
      if (isResolved) return;
      isResolved = true;
      window.clearTimeout(timeoutId);
      peerConnection.onicegatheringstatechange = previousHandler;
      resolve();
    }

    peerConnection.onicegatheringstatechange = function handleIceGatheringStateChange(event) {
      previousHandler?.call(peerConnection, event);
      if (peerConnection.iceGatheringState === "complete") {
        resolveOnce();
      }
    };
  });
}

export function waitForPeerConnectionReady(
  peerConnection: RTCPeerConnection,
  timeoutMs = MEDIA_CONNECTION_TIMEOUT_MS,
): Promise<void> {
  if (isPublisherPeerConnectionReady(peerConnection)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let isResolved = false;
    const previousConnectionHandler = peerConnection.onconnectionstatechange;
    const previousIceHandler = peerConnection.oniceconnectionstatechange;
    const timeoutId = window.setTimeout(() => {
      rejectOnce(new Error(MEDIA_CONNECTION_TIMEOUT_MESSAGE));
    }, timeoutMs);

    function resolveOnce(): void {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve();
    }

    function rejectOnce(error: Error): void {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject(error);
    }

    function cleanup(): void {
      window.clearTimeout(timeoutId);
      peerConnection.onconnectionstatechange = previousConnectionHandler;
      peerConnection.oniceconnectionstatechange = previousIceHandler;
    }

    function checkReady(): void {
      if (isPublisherPeerConnectionReady(peerConnection)) {
        resolveOnce();
        return;
      }
      if (isPublisherPeerConnectionFailed(peerConnection)) {
        rejectOnce(new Error(MEDIA_CONNECTION_FAILED_MESSAGE));
      }
    }

    peerConnection.onconnectionstatechange = function handleConnectionStateChange(event) {
      previousConnectionHandler?.call(peerConnection, event);
      checkReady();
    };
    peerConnection.oniceconnectionstatechange = function handleIceConnectionStateChange(event) {
      previousIceHandler?.call(peerConnection, event);
      checkReady();
    };

    checkReady();
  });
}
