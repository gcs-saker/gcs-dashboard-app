import { useEffect, useMemo, useRef, useState } from "react";

import { apiUrl, LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL, WEBRTC_ICE_SERVERS } from "../../../config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../../auth/authApi";
import { loadWebRtcIceServers } from "../iceServers";
import "./LocalWebcamPublisher.css";

type WebcamPublisherStatus =
  | "idle"
  | "requesting-camera"
  | "previewing"
  | "creating-offer"
  | "gathering-ice"
  | "sending-offer"
  | "signaling-complete"
  | "connecting-media"
  | "published"
  | "reconnecting"
  | "error"
  | "unsupported";

type PublisherStepId = "camera" | "ice" | "signaling" | "media";
type PublisherStepState = "pending" | "active" | "complete" | "error";
type PublisherGpsStatus = "idle" | "requesting" | "active" | "unavailable" | "error";

const ICE_GATHERING_TIMEOUT_MS = 5_000;
const MEDIA_CONNECTION_TIMEOUT_MS = 8_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000] as const;

interface LocalWebcamPublisherProps {
  streamId?: string;
  whipUrl?: string;
  mediaDevices?: MediaDevices;
  peerConnectionFactory?: () => RTCPeerConnection;
  fetcher?: typeof fetch;
  geolocation?: Geolocation;
}

export function LocalWebcamPublisher({
  streamId = LOCAL_WEBCAM_STREAM_ID,
  whipUrl = LOCAL_WEBCAM_WHIP_URL,
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory,
  fetcher = fetch,
  geolocation = navigator.geolocation,
}: LocalWebcamPublisherProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const gpsWatchIdRef = useRef<number | null>(null);
  const publishStartedAtRef = useRef<number | null>(null);
  const statusRef = useRef<WebcamPublisherStatus>("idle");
  const [status, setStatus] = useState<WebcamPublisherStatus>("idle");
  const [gpsStatus, setGpsStatus] = useState<PublisherGpsStatus>("idle");
  const [gpsDetail, setGpsDetail] = useState("GPS 대기");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<PublisherStepId | null>(null);
  const steps = useMemo(() => getPublisherSteps(status, failedStep), [failedStep, status]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => () => stopAll(), []);

  async function startPreview(): Promise<void> {
    if (!mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setFailedStep("camera");
      setErrorMessage("이 브라우저에서는 카메라 캡처를 지원하지 않습니다.");
      return;
    }

    try {
      setFailedStep(null);
      setStatus("requesting-camera");
      const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setErrorMessage(null);
      setStatus("previewing");
    } catch (error) {
      setStatus("error");
      setFailedStep("camera");
      setErrorMessage(error instanceof Error ? error.message : "카메라 권한을 받을 수 없습니다.");
    }
  }

  async function publish(): Promise<void> {
    if (!streamRef.current) {
      setStatus("error");
      setFailedStep("camera");
      setErrorMessage("송출 전 카메라 미리보기를 먼저 준비해야 합니다.");
      return;
    }

    let currentStep: PublisherStepId = "ice";
    try {
      clearReconnectTimer();
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      setFailedStep(null);
      setStatus("creating-offer");
      const iceServers = peerConnectionFactory ? WEBRTC_ICE_SERVERS : await loadWebRtcIceServers(fetcher);
      const peerConnection = peerConnectionFactory?.() ?? new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = peerConnection;
      peerConnection.onconnectionstatechange = () => handlePublishedConnectionChange(peerConnection);
      peerConnection.oniceconnectionstatechange = () => handlePublishedConnectionChange(peerConnection);
      for (const track of streamRef.current.getTracks()) {
        peerConnection.addTrack(track, streamRef.current);
      }

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      setStatus("gathering-ice");
      await waitForIceGatheringComplete(peerConnection);
      const sdp = peerConnection.localDescription?.sdp;
      if (!sdp) {
        throw new Error("로컬 WebRTC offer SDP가 생성되지 않았습니다.");
      }

      currentStep = "signaling";
      setStatus("sending-offer");
      const response = await fetcher(whipUrl, {
        method: "POST",
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: sdp,
      });
      if (!response.ok) {
        throw new Error(`WHIP publish failed with ${response.status}`);
      }

      const answer = await response.text();
      setStatus("signaling-complete");
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
      currentStep = "media";
      setStatus("connecting-media");
      await waitForPeerConnectionReady(peerConnection);
      setErrorMessage(null);
      reconnectAttemptRef.current = 0;
      setStatus("published");
      startGpsTelemetry();
    } catch (error) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      stopGpsTelemetry();
      setStatus("error");
      setFailedStep(currentStep);
      setErrorMessage(error instanceof Error ? error.message : "로컬 웹캠 송출에 실패했습니다.");
    }
  }

  function stopAll(): void {
    clearReconnectTimer();
    stopGpsTelemetry();
    reconnectAttemptRef.current = 0;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
    setFailedStep(null);
  }

  function startGpsTelemetry(): void {
    if (!geolocation) {
      setGpsStatus("unavailable");
      setGpsDetail("이 브라우저에서는 GPS 위치를 지원하지 않습니다.");
      return;
    }
    stopGpsTelemetry();
    publishStartedAtRef.current = Date.now();
    setGpsStatus("requesting");
    setGpsDetail("GPS 권한 요청 중");
    const options: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 2_000,
      timeout: 10_000,
    };
    geolocation.getCurrentPosition(handleGpsPosition, handleGpsError, options);
    gpsWatchIdRef.current = geolocation.watchPosition(handleGpsPosition, handleGpsError, options);
  }

  function stopGpsTelemetry(): void {
    if (gpsWatchIdRef.current !== null && geolocation) {
      geolocation.clearWatch(gpsWatchIdRef.current);
    }
    gpsWatchIdRef.current = null;
    publishStartedAtRef.current = null;
    setGpsStatus("idle");
    setGpsDetail("GPS 대기");
  }

  function handleGpsPosition(position: GeolocationPosition): void {
    setGpsStatus("active");
    setGpsDetail(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
    void postGpsTelemetry(position);
  }

  function handleGpsError(error: GeolocationPositionError): void {
    setGpsStatus("error");
    setGpsDetail(error.message || "GPS 위치를 받을 수 없습니다.");
  }

  async function postGpsTelemetry(position: GeolocationPosition): Promise<void> {
    try {
      const response = await authenticatedFetch(
        apiUrl(DASHBOARD_API_ROUTES.telemetryIngest),
        {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            uuid: streamId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            altitude: position.coords.altitude ?? 0,
            velocity: position.coords.speed ?? 0,
            epochTime: elapsedPublishSeconds(),
          }),
        },
        fetcher,
      );
      if (!response.ok) {
        setGpsStatus("error");
        setGpsDetail(`GPS 전송 실패 ${response.status}`);
      }
    } catch (error) {
      setGpsStatus("error");
      setGpsDetail(error instanceof Error ? error.message : "GPS 전송 실패");
    }
  }

  function elapsedPublishSeconds(): number {
    if (!publishStartedAtRef.current) return 0;
    return Math.max(0, Math.floor((Date.now() - publishStartedAtRef.current) / 1000));
  }

  function handlePublishedConnectionChange(peerConnection: RTCPeerConnection): void {
    const isDisconnected = (
      peerConnection.connectionState === "disconnected" ||
      peerConnection.connectionState === "failed" ||
      peerConnection.connectionState === "closed" ||
      peerConnection.iceConnectionState === "disconnected" ||
      peerConnection.iceConnectionState === "failed" ||
      peerConnection.iceConnectionState === "closed"
    );
    if (!isDisconnected || statusRef.current !== "published") {
      return;
    }
    scheduleReconnect(
      `송출 미디어 연결이 끊겼습니다 (${peerConnection.connectionState}/${peerConnection.iceConnectionState}). 재연결을 시도합니다.`,
    );
  }

  function scheduleReconnect(message: string): void {
    if (!streamRef.current || reconnectTimeoutRef.current !== null) {
      return;
    }
    stopGpsTelemetry();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttemptRef.current += 1;
    setFailedStep("media");
    setErrorMessage(message);
    setStatus("reconnecting");
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      void publish();
    }, delay);
  }

  function clearReconnectTimer(): void {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }

  return (
    <main className="local-webcam-publisher" aria-label="Local webcam WebRTC test publisher">
      <header className="local-webcam-publisher__header">
        <h1>로컬 웹캠 송출</h1>
        <span className="local-webcam-publisher__badge" role="status" aria-live="polite">
          {getStatusLabel(status)}
        </span>
        <span className="local-webcam-publisher__stream">{streamId}</span>
        <span className="local-webcam-publisher__whip">{whipUrl}</span>
      </header>
      <ol className="local-webcam-publisher__steps" aria-label="WebRTC 송출 단계">
        {steps.map((step) => (
          <li
            key={step.id}
            className={`local-webcam-publisher__step local-webcam-publisher__step--${step.state}`}
            aria-current={step.state === "active" ? "step" : undefined}
          >
            <span className="local-webcam-publisher__step-index">{step.index}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      <div className="local-webcam-publisher__controls">
        <button type="button" onClick={() => void startPreview()} disabled={isBusy(status) || status === "published"}>
          카메라 준비
        </button>
        <button type="button" onClick={() => void publish()} disabled={status !== "previewing"}>
          시그널링 시작
        </button>
        <button type="button" onClick={stopAll}>
          중지
        </button>
      </div>
      <video ref={videoRef} className="local-webcam-publisher__video" aria-label="Local camera preview" autoPlay muted playsInline />
      <p className="local-webcam-publisher__status-detail" aria-live="polite">
        {getStatusDetail(status)}
      </p>
      <p className={`local-webcam-publisher__gps local-webcam-publisher__gps--${gpsStatus}`} aria-live="polite">
        GPS: {getGpsStatusLabel(gpsStatus)} / {gpsDetail}
      </p>
      {errorMessage ? <p className="local-webcam-publisher__error">{errorMessage}</p> : null}
    </main>
  );
}

function getGpsStatusLabel(status: PublisherGpsStatus): string {
  const labels: Record<PublisherGpsStatus, string> = {
    idle: "대기",
    requesting: "권한 요청",
    active: "수신 중",
    unavailable: "미지원",
    error: "오류",
  };
  return labels[status];
}

export default LocalWebcamPublisher;

function waitForIceGatheringComplete(
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

function waitForPeerConnectionReady(
  peerConnection: RTCPeerConnection,
  timeoutMs = MEDIA_CONNECTION_TIMEOUT_MS,
): Promise<void> {
  if (isPeerConnectionReady(peerConnection)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let isResolved = false;
    const previousConnectionHandler = peerConnection.onconnectionstatechange;
    const previousIceHandler = peerConnection.oniceconnectionstatechange;
    const timeoutId = window.setTimeout(() => {
      rejectOnce(new Error("시그널링은 완료됐지만 WebRTC 미디어 연결이 시간 안에 완료되지 않았습니다."));
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
      if (isPeerConnectionReady(peerConnection)) {
        resolveOnce();
        return;
      }
      if (peerConnection.connectionState === "failed" || peerConnection.iceConnectionState === "failed") {
        rejectOnce(new Error("WebRTC ICE 미디어 연결이 실패했습니다."));
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

function isPeerConnectionReady(peerConnection: RTCPeerConnection): boolean {
  return peerConnection.connectionState === "connected" || ["connected", "completed"].includes(peerConnection.iceConnectionState);
}

function isBusy(status: WebcamPublisherStatus): boolean {
  return [
    "requesting-camera",
    "creating-offer",
    "gathering-ice",
    "sending-offer",
    "signaling-complete",
    "connecting-media",
    "reconnecting",
  ].includes(status);
}

function getStatusLabel(status: WebcamPublisherStatus): string {
  const labels: Record<WebcamPublisherStatus, string> = {
    idle: "대기",
    "requesting-camera": "카메라 권한 요청",
    previewing: "미리보기 준비",
    "creating-offer": "Offer 생성",
    "gathering-ice": "ICE 후보 수집",
    "sending-offer": "WHIP 전송",
    "signaling-complete": "시그널링 완료",
    "connecting-media": "미디어 연결",
    published: "송출 중",
    reconnecting: "재연결 중",
    error: "오류",
    unsupported: "지원 안 됨",
  };
  return labels[status];
}

function getStatusDetail(status: WebcamPublisherStatus): string {
  const details: Record<WebcamPublisherStatus, string> = {
    idle: "카메라를 준비하면 WebRTC 송출 단계를 시작할 수 있습니다.",
    "requesting-camera": "브라우저 카메라와 마이크 권한을 요청하고 있습니다.",
    previewing: "카메라 미리보기가 준비됐습니다. 시그널링을 시작할 수 있습니다.",
    "creating-offer": "브라우저에서 WebRTC offer를 생성하고 있습니다.",
    "gathering-ice": "STUN/TURN ICE 서버를 이용해 후보를 수집하고 있습니다.",
    "sending-offer": "WHIP 엔드포인트로 offer SDP를 전송하고 있습니다.",
    "signaling-complete": "WHIP answer를 받았습니다. 미디어 연결을 확정합니다.",
    "connecting-media": "ICE 미디어 경로가 실제로 연결되는지 확인하고 있습니다.",
    published: "WebRTC 미디어 연결이 완료되어 송출 중입니다.",
    reconnecting: "송출 미디어 경로가 끊겨 재연결을 시도하고 있습니다.",
    error: "오류 내용을 확인한 뒤 다시 시도할 수 있습니다.",
    unsupported: "현재 브라우저 환경에서는 로컬 카메라 WebRTC 송출을 지원하지 않습니다.",
  };
  return details[status];
}

function getPublisherSteps(status: WebcamPublisherStatus, failedStep: PublisherStepId | null): Array<{
  id: PublisherStepId;
  index: number;
  label: string;
  state: PublisherStepState;
}> {
  const activeStepByStatus: Partial<Record<WebcamPublisherStatus, PublisherStepId>> = {
    "requesting-camera": "camera",
    previewing: "camera",
    "creating-offer": "ice",
    "gathering-ice": "ice",
    "sending-offer": "signaling",
    "signaling-complete": "signaling",
    "connecting-media": "media",
    published: "media",
    reconnecting: "media",
  };
  const order: PublisherStepId[] = ["camera", "ice", "signaling", "media"];
  const labels: Record<PublisherStepId, string> = {
    camera: "카메라 준비",
    ice: "ICE 후보 수집",
    signaling: "WHIP 시그널링",
    media: "미디어 연결",
  };
  const activeStep = status === "error" ? failedStep : activeStepByStatus[status];
  const activeIndex = activeStep ? order.indexOf(activeStep) : -1;

  return order.map((id, index) => ({
    id,
    index: index + 1,
    label: labels[id],
    state: getPublisherStepState(status, index, activeIndex),
  }));
}

function getPublisherStepState(status: WebcamPublisherStatus, index: number, activeIndex: number): PublisherStepState {
  if (status === "error") {
    return index === Math.max(activeIndex, 0) ? "error" : index < Math.max(activeIndex, 0) ? "complete" : "pending";
  }
  if (status === "published") {
    return "complete";
  }
  if (activeIndex === -1) {
    return "pending";
  }
  if (index < activeIndex) {
    return "complete";
  }
  if (index === activeIndex) {
    return status === "previewing" || status === "signaling-complete" ? "complete" : "active";
  }
  return "pending";
}
