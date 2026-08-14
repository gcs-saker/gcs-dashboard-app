import type { Dispatch } from "react";

import { WEBRTC_ICE_SERVERS } from "@/config";
import type { PlaybackAction, SignalingTimingRecorder } from "@streaming/hooks/playback/whepPlaybackContracts";
import {
  isWhepConnectionInterrupted,
  isWhepConnectionReady,
} from "@streaming/hooks/playback/whepConnectionState";
import { postWhepOfferWithReadyRetry } from "@streaming/hooks/playback/whepOfferClient";
import { countSdpCandidates, messageFromUnknown, reportWhepDebug } from "@streaming/hooks/playback/whepPlaybackDebug";

const ICE_GATHERING_TIMEOUT_MS = 2500;
const DIRECT_FIRST_RTC_CONFIGURATION = Object.freeze({
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 0,
  iceTransportPolicy: "all",
} satisfies Omit<RTCConfiguration, "iceServers">);

export function dispatchStateFromConnection(
  peerConnection: RTCPeerConnection,
  dispatch: Dispatch<PlaybackAction>,
): void {
  const connectionState = peerConnection.connectionState;
  const iceConnectionState = peerConnection.iceConnectionState;

  if (isWhepConnectionReady(connectionState, iceConnectionState)) {
    dispatch({ type: "playing", connectionState, iceConnectionState });
    return;
  }

  if (isWhepConnectionInterrupted(connectionState, iceConnectionState)) {
    dispatch({
      type: "error",
      message: `WebRTC connection interrupted (${connectionState}/${iceConnectionState})`,
      connectionState,
      iceConnectionState,
    });
    return;
  }

  dispatch({ type: "connection", connectionState, iceConnectionState });
}

export async function connectWithWhep(
  peerConnection: RTCPeerConnection,
  whepUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<void> {
  const offer = await peerConnection.createOffer();
  recordTiming("offerCreatedMs");
  reportWhepDebug("offer-created", whepUrl);
  await peerConnection.setLocalDescription(offer);
  recordTiming("localDescriptionSetMs");
  reportWhepDebug("local-description-set", whepUrl);
  await waitForIceGatheringComplete(peerConnection, signal, ICE_GATHERING_TIMEOUT_MS);
  recordTiming("iceGatheringDoneMs");
  reportWhepDebug("ice-wait-done", whepUrl, { state: peerConnection.iceGatheringState });

  if (signal.aborted) {
    reportWhepDebug("aborted-before-post", whepUrl);
    throw new Error("WebRTC playback was aborted");
  }

  const localDescription = peerConnection.localDescription;
  if (!localDescription?.sdp) {
    reportWhepDebug("missing-local-sdp", whepUrl);
    throw new Error("WebRTC local offer SDP was not created");
  }

  reportWhepDebug("whep-post-start", whepUrl, { candidates: String(countSdpCandidates(localDescription.sdp)) });
  const response = await postWhepOfferWithReadyRetry(whepUrl, localDescription.sdp, fetcher, signal, recordTiming);

  const answerSdp = await response.text();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
  recordTiming("remoteDescriptionSetMs");
  reportWhepDebug("remote-description-set", whepUrl, { candidates: String(countSdpCandidates(answerSdp)) });
}

export function createPeerConnection(iceServers: RTCIceServer[], whepUrl: string): RTCPeerConnection {
  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("WebRTC is not supported");
  }

  try {
    return new RTCPeerConnection({ ...DIRECT_FIRST_RTC_CONFIGURATION, iceServers });
  } catch (primaryError) {
    reportWhepDebug("pc-primary-config-failed", whepUrl, { message: messageFromUnknown(primaryError) });
  }

  try {
    return new RTCPeerConnection({ ...DIRECT_FIRST_RTC_CONFIGURATION, iceServers: WEBRTC_ICE_SERVERS });
  } catch (fallbackError) {
    reportWhepDebug("pc-fallback-config-failed", whepUrl, { message: messageFromUnknown(fallbackError) });
  }

  return new RTCPeerConnection();
}

export function requestVideoPlayback(videoElement: HTMLVideoElement, dispatch: Dispatch<PlaybackAction>): void {
  try {
    const playResult = videoElement.play();
    void playResult
      ?.then(() => dispatch({ type: "audio-playback", blocked: false }))
      .catch(() => dispatch({ type: "audio-playback", blocked: true }));
  } catch {
    dispatch({ type: "audio-playback", blocked: true });
  }
}

function waitForIceGatheringComplete(
  peerConnection: RTCPeerConnection,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let isResolved = false;
    const finish = () => {
      if (isResolved) return;
      isResolved = true;
      globalThis.clearTimeout(timeoutId);
      signal.removeEventListener("abort", finish);
      peerConnection.onicegatheringstatechange = null;
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, timeoutMs);

    signal.addEventListener("abort", finish, { once: true });
    peerConnection.onicegatheringstatechange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        finish();
      }
    };
  });
}
