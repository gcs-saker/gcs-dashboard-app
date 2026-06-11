import { useEffect, useMemo, useRef, useState } from "react";

import { apiUrl, LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL, WEBRTC_ICE_SERVERS } from "../../../config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../../auth/authApi";
import { loadWebRtcIceServers } from "../iceServers";
import { TalkbackAudioReceiver } from "./TalkbackAudioReceiver";
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
type PublisherDeviceStatus = "idle" | "loading" | "loaded" | "unavailable" | "error";
type AudioCaptureMode = "low-latency" | "quality";

const ICE_GATHERING_TIMEOUT_MS = 5_000;
const MEDIA_CONNECTION_TIMEOUT_MS = 8_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000] as const;
const DEFAULT_CAMERA_DEVICE_ID = "__default_camera__";
const FRONT_CAMERA_DEVICE_ID = "__front_camera__";
const REAR_CAMERA_DEVICE_ID = "__rear_camera__";
const DEFAULT_MICROPHONE_DEVICE_ID = "__default_microphone__";
const NO_MICROPHONE_DEVICE_ID = "__no_microphone__";

interface PublisherStreamTarget {
  id: string;
  label: string;
  whipPath: string;
}

const DEFAULT_STREAM_TARGETS: readonly PublisherStreamTarget[] = [
  { id: LOCAL_WEBCAM_STREAM_ID, label: "기본 웹캠", whipPath: "raw/local/webcam" },
  { id: "raw.local.front", label: "휴대폰 전면", whipPath: "raw/local/front" },
  { id: "raw.local.rear", label: "휴대폰 후면", whipPath: "raw/local/rear" },
] as const;

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
  const [audioMode, setAudioMode] = useState<AudioCaptureMode>("low-latency");
  const streamTargets = useMemo(() => ensureStreamTargets(DEFAULT_STREAM_TARGETS, streamId, whipUrl), [streamId, whipUrl]);
  const [selectedStreamId, setSelectedStreamId] = useState(streamId);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(DEFAULT_CAMERA_DEVICE_ID);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(DEFAULT_MICROPHONE_DEVICE_ID);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<PublisherDeviceStatus>("idle");
  const selectedStreamTarget = useMemo(
    () => streamTargets.find((target) => target.id === selectedStreamId) ?? streamTargets[0],
    [selectedStreamId, streamTargets],
  );
  const selectedWhipUrl = useMemo(
    () => buildWhipUrl(whipUrl, selectedStreamTarget.whipPath),
    [selectedStreamTarget.whipPath, whipUrl],
  );
  const steps = useMemo(() => getPublisherSteps(status, failedStep), [failedStep, status]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (!streamTargets.some((target) => target.id === selectedStreamId)) {
      setSelectedStreamId(streamTargets[0].id);
    }
  }, [selectedStreamId, streamTargets]);

  useEffect(() => {
    void refreshMediaDevices();
    if (!mediaDevices?.addEventListener) {
      return undefined;
    }
    const handleDeviceChange = () => {
      void refreshMediaDevices();
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener?.("devicechange", handleDeviceChange);
  }, [mediaDevices]);

  useEffect(() => () => stopAll(), []);

  async function refreshMediaDevices(): Promise<void> {
    if (!mediaDevices?.enumerateDevices) {
      setDeviceStatus("unavailable");
      return;
    }
    try {
      setDeviceStatus("loading");
      const devices = await mediaDevices.enumerateDevices();
      setVideoInputs(devices.filter((device) => device.kind === "videoinput"));
      setAudioInputs(devices.filter((device) => device.kind === "audioinput"));
      setDeviceStatus("loaded");
    } catch {
      setDeviceStatus("error");
    }
  }

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
      const stream = await mediaDevices.getUserMedia({
        video: videoCaptureConstraints(selectedVideoDeviceId),
        audio: audioCaptureConstraints(audioMode, selectedAudioDeviceId),
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      void refreshMediaDevices();
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
      const response = await fetcher(selectedWhipUrl, {
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

  function resetCaptureForInputChange(): void {
    if (statusRef.current === "idle") {
      setFailedStep(null);
      setErrorMessage(null);
      return;
    }

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
    setErrorMessage(null);
  }

  function handleStreamTargetChange(nextStreamId: string): void {
    setSelectedStreamId(nextStreamId);
    resetCaptureForInputChange();
  }

  function handleVideoDeviceChange(nextDeviceId: string): void {
    setSelectedVideoDeviceId(nextDeviceId);
    resetCaptureForInputChange();
  }

  function handleAudioDeviceChange(nextDeviceId: string): void {
    setSelectedAudioDeviceId(nextDeviceId);
    resetCaptureForInputChange();
  }

  function handleAudioModeChange(nextAudioMode: AudioCaptureMode): void {
    setAudioMode(nextAudioMode);
    resetCaptureForInputChange();
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
            uuid: selectedStreamTarget.id,
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
        <span className="local-webcam-publisher__stream">{selectedStreamTarget.id}</span>
        <span className="local-webcam-publisher__whip">{selectedWhipUrl}</span>
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
      <fieldset className="local-webcam-publisher__field-group" disabled={isBusy(status)}>
        <legend>송출 stream</legend>
        <label>
          대상
          <select
            aria-label="송출 stream 선택"
            onChange={(event) => handleStreamTargetChange(event.currentTarget.value)}
            value={selectedStreamTarget.id}
          >
            {streamTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label} / {target.id}
              </option>
            ))}
          </select>
        </label>
        <span>{selectedStreamTarget.whipPath}</span>
      </fieldset>
      <fieldset className="local-webcam-publisher__field-group" disabled={isBusy(status)}>
        <legend>입력 장치</legend>
        <label>
          카메라
          <select
            aria-label="카메라 입력 선택"
            onChange={(event) => handleVideoDeviceChange(event.currentTarget.value)}
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
            onChange={(event) => handleAudioDeviceChange(event.currentTarget.value)}
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
        <button type="button" onClick={() => void refreshMediaDevices()}>
          장치 새로고침
        </button>
        <span>{getDeviceStatusDetail(deviceStatus, videoInputs.length, audioInputs.length)}</span>
      </fieldset>
      <fieldset className="local-webcam-publisher__audio-mode" disabled={isBusy(status)}>
        <legend>음성 처리</legend>
        <label>
          <input
            checked={audioMode === "low-latency"}
            name="audio-mode"
            onChange={() => handleAudioModeChange("low-latency")}
            type="radio"
            value="low-latency"
          />
          저지연
        </label>
        <label>
          <input
            checked={audioMode === "quality"}
            name="audio-mode"
            onChange={() => handleAudioModeChange("quality")}
            type="radio"
            value="quality"
          />
          음질
        </label>
        <span>{getAudioModeDetail(audioMode)}</span>
      </fieldset>
      <video ref={videoRef} className="local-webcam-publisher__video" aria-label="Local camera preview" autoPlay muted playsInline />
      <p className="local-webcam-publisher__status-detail" aria-live="polite">
        {getStatusDetail(status)}
      </p>
      <p className={`local-webcam-publisher__gps local-webcam-publisher__gps--${gpsStatus}`} aria-live="polite">
        GPS: {getGpsStatusLabel(gpsStatus)} / {gpsDetail}
      </p>
      <TalkbackAudioReceiver streamId={selectedStreamTarget.id} />
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

function videoCaptureConstraints(selectedDeviceId: string): boolean | MediaTrackConstraints {
  if (selectedDeviceId === FRONT_CAMERA_DEVICE_ID) {
    return { facingMode: { ideal: "user" } };
  }
  if (selectedDeviceId === REAR_CAMERA_DEVICE_ID) {
    return { facingMode: { ideal: "environment" } };
  }
  if (selectedDeviceId !== DEFAULT_CAMERA_DEVICE_ID) {
    return { deviceId: { exact: selectedDeviceId } };
  }
  return true;
}

function audioCaptureConstraints(mode: AudioCaptureMode, selectedDeviceId = DEFAULT_MICROPHONE_DEVICE_ID): boolean | MediaTrackConstraints {
  if (selectedDeviceId === NO_MICROPHONE_DEVICE_ID) {
    return false;
  }
  const constraints: MediaTrackConstraints = {
    echoCancellation: mode === "quality",
    noiseSuppression: mode === "quality",
    autoGainControl: mode === "quality",
    channelCount: 1,
    sampleRate: 48_000,
  };
  if (selectedDeviceId !== DEFAULT_MICROPHONE_DEVICE_ID) {
    constraints.deviceId = { exact: selectedDeviceId };
  }
  return constraints;
}

function ensureStreamTargets(
  defaultTargets: readonly PublisherStreamTarget[],
  streamId: string,
  whipUrl: string,
): PublisherStreamTarget[] {
  const explicitTarget: PublisherStreamTarget = {
    id: streamId,
    label: "현재 설정",
    whipPath: inferWhipPath(whipUrl) ?? streamIdToWhipPath(streamId),
  };
  if (defaultTargets.some((target) => target.id === explicitTarget.id)) {
    return [...defaultTargets];
  }
  return [explicitTarget, ...defaultTargets];
}

function streamIdToWhipPath(streamId: string): string {
  return streamId.split(".").join("/");
}

function inferWhipPath(whipUrl: string): string | null {
  const suffix = "/whip";
  const suffixIndex = whipUrl.indexOf(suffix);
  if (suffixIndex === -1) {
    return null;
  }
  const marker = "/webrtc/";
  const markerIndex = whipUrl.lastIndexOf(marker, suffixIndex);
  if (markerIndex !== -1) {
    return whipUrl.slice(markerIndex + marker.length, suffixIndex);
  }
  const pathStartIndex = whipUrl.lastIndexOf("/", Math.max(0, suffixIndex - 1));
  const schemeIndex = whipUrl.indexOf("://");
  const originEndIndex = schemeIndex === -1 ? -1 : whipUrl.indexOf("/", schemeIndex + 3);
  const fallbackStartIndex = originEndIndex === -1 ? 0 : originEndIndex + 1;
  const inferredPath = whipUrl.slice(fallbackStartIndex, suffixIndex).replace(/^\/+/, "");
  if (pathStartIndex === -1 || !inferredPath) {
    return null;
  }
  return inferredPath;
}

function buildWhipUrl(baseWhipUrl: string, whipPath: string): string {
  const suffix = "/whip";
  const suffixIndex = baseWhipUrl.indexOf(suffix);
  if (suffixIndex === -1) {
    return `/webrtc/${whipPath}/whip`;
  }
  const marker = "/webrtc/";
  const markerIndex = baseWhipUrl.lastIndexOf(marker, suffixIndex);
  if (markerIndex !== -1) {
    return `${baseWhipUrl.slice(0, markerIndex)}${marker}${whipPath}${baseWhipUrl.slice(suffixIndex)}`;
  }
  const inferredPath = inferWhipPath(baseWhipUrl);
  if (inferredPath) {
    return baseWhipUrl.replace(`/${inferredPath}${suffix}`, `/${whipPath}${suffix}`);
  }
  return `/webrtc/${whipPath}/whip`;
}

function getDeviceStatusDetail(status: PublisherDeviceStatus, videoCount: number, audioCount: number): string {
  if (status === "loading") {
    return "장치 목록 확인 중";
  }
  if (status === "loaded") {
    return `카메라 ${videoCount}개 / 마이크 ${audioCount}개 감지`;
  }
  if (status === "unavailable") {
    return "브라우저 장치 목록 API를 사용할 수 없습니다.";
  }
  if (status === "error") {
    return "장치 목록을 읽지 못했습니다.";
  }
  return "장치 목록 대기";
}

function getAudioModeDetail(mode: AudioCaptureMode): string {
  if (mode === "quality") {
    return "잡음/에코 처리를 켜지만 지연이 늘 수 있습니다.";
  }
  return "브라우저 음성 후처리를 줄여 지연을 우선합니다.";
}

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
