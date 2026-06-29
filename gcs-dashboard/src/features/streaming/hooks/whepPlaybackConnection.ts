import type { Dispatch } from "react";

import { WEBRTC_ICE_SERVERS } from "../../../config";
import type { WebRTCPlaybackStatus } from "../types";
import type { PlaybackAction, SignalingTimingRecorder } from "./whepPlaybackContracts";
import { countSdpCandidates, messageFromUnknown, reportWhepDebug } from "./whepPlaybackDebug";

const ICE_GATHERING_TIMEOUT_MS = 2500;
const WHEP_READY_RETRY_STATUS_CODES = new Set([404, 409, 425, 503]);
const WHEP_READY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const DIRECT_FIRST_RTC_CONFIGURATION = Object.freeze({
  bundlePolicy: "max-bundle",
  iceCandidatePoolSize: 0,
  iceTransportPolicy: "all",
} satisfies Omit<RTCConfiguration, "iceServers">);

class WhepHttpError extends Error {
  constructor(readonly status: number) {
    super(`WHEP request failed with ${status}`);
  }
}

export function dispatchStateFromConnection(
  peerConnection: RTCPeerConnection,
  dispatch: Dispatch<PlaybackAction>,
): void {
  const connectionState = peerConnection.connectionState;
  const iceConnectionState = peerConnection.iceConnectionState;

  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    dispatch({ type: "playing", connectionState, iceConnectionState });
    return;
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
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

export function statusFromConnection(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
  fallbackStatus: WebRTCPlaybackStatus,
): WebRTCPlaybackStatus {
  if (connectionState === "connected" || iceConnectionState === "connected" || iceConnectionState === "completed") {
    return "playing";
  }

  if (
    connectionState === "failed" ||
    connectionState === "disconnected" ||
    connectionState === "closed" ||
    iceConnectionState === "failed" ||
    iceConnectionState === "disconnected" ||
    iceConnectionState === "closed"
  ) {
    return "error";
  }

  return fallbackStatus === "idle" ? "loading" : fallbackStatus;
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

async function postWhepOfferWithReadyRetry(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      return await postWhepOffer(whepUrl, offerSdp, fetcher, signal, recordTiming);
    } catch (error) {
      if (!(error instanceof WhepHttpError) || !isRetryableWhepStatus(error.status) || attempt >= WHEP_READY_RETRY_DELAYS_MS.length) {
        throw error;
      }
      const delayMs = WHEP_READY_RETRY_DELAYS_MS[attempt];
      attempt += 1;
      reportWhepDebug("whep-ready-retry", whepUrl, { status: String(error.status), delayMs: String(delayMs) });
      await sleepUnlessAborted(delayMs, signal);
    }
  }
}

async function postWhepOffer(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  const response = await fetcher(whepUrl, {
    method: "POST",
    headers: {
      Accept: "application/sdp",
      "Content-Type": "application/sdp",
    },
    body: offerSdp,
    signal,
  });
  recordTiming("whepResponseMs");
  reportWhepDebug("whep-post-response", whepUrl, { status: String(response.status) });

  if (!response.ok) {
    throw new WhepHttpError(response.status);
  }

  return response;
}

function isRetryableWhepStatus(status: number): boolean {
  return WHEP_READY_RETRY_STATUS_CODES.has(status);
}

function sleepUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new Error("WebRTC playback was aborted"));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("WebRTC playback was aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
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
