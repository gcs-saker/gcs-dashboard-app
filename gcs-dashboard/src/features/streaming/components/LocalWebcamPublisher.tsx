import { useEffect, useMemo, useRef, useState } from "react";

import { apiUrl, LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL, WEBRTC_ICE_SERVERS } from "../../../config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../../auth/authApi";
import { loadWebRtcIceServers } from "../iceServers";
import { TalkbackAudioReceiver } from "./TalkbackAudioReceiver";
import { fetchAuthorizedPublishWhipUrl } from "./publisherApi";
import {
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_MICROPHONE_DEVICE_ID,
  FRONT_CAMERA_DEVICE_ID,
  NO_MICROPHONE_DEVICE_ID,
  RECONNECT_DELAYS_MS,
  REAR_CAMERA_DEVICE_ID,
  type AudioCaptureMode,
  type PublisherDeviceStatus,
  type PublisherGpsStatus,
  type PublisherStepId,
  type WebcamPublisherStatus,
} from "./publisherContracts";
import { audioCaptureConstraints, videoCaptureConstraints } from "./publisherMediaConstraints";
import {
  getAudioModeDetail,
  getDeviceStatusDetail,
  getGpsStatusLabel,
  getPublisherSteps,
  getStatusDetail,
  getStatusLabel,
  isBusy,
} from "./publisherStatusPresentation";
import { buildWhipUrl, DEFAULT_STREAM_TARGETS, ensureStreamTargets } from "./publisherTargets";
import { waitForIceGatheringComplete, waitForPeerConnectionReady } from "./publisherWebRtc";
import "./LocalWebcamPublisher.css";

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

  function updateStatus(nextStatus: WebcamPublisherStatus): void {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }

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
      updateStatus("unsupported");
      setFailedStep("camera");
      setErrorMessage("이 브라우저에서는 카메라 캡처를 지원하지 않습니다.");
      return;
    }

    try {
      setFailedStep(null);
      updateStatus("requesting-camera");
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
      updateStatus("previewing");
    } catch (error) {
      updateStatus("error");
      setFailedStep("camera");
      setErrorMessage(error instanceof Error ? error.message : "카메라 권한을 받을 수 없습니다.");
    }
  }

  async function publish(): Promise<void> {
    if (!streamRef.current) {
      updateStatus("error");
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
      updateStatus("creating-offer");
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
      updateStatus("gathering-ice");
      await waitForIceGatheringComplete(peerConnection);
      const sdp = peerConnection.localDescription?.sdp;
      if (!sdp) {
        throw new Error("로컬 WebRTC offer SDP가 생성되지 않았습니다.");
      }

      currentStep = "signaling";
      updateStatus("sending-offer");
      const publishWhipUrl = await fetchAuthorizedPublishWhipUrl(selectedStreamTarget.id, fetcher);
      const response = await fetcher(publishWhipUrl, {
        method: "POST",
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: sdp,
      });
      if (!response.ok) {
        throw new Error(`WHIP publish failed with ${response.status}`);
      }

      const answer = await response.text();
      updateStatus("signaling-complete");
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
      currentStep = "media";
      updateStatus("connecting-media");
      await waitForPeerConnectionReady(peerConnection);
      setErrorMessage(null);
      reconnectAttemptRef.current = 0;
      updateStatus("published");
      startGpsTelemetry();
    } catch (error) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      stopGpsTelemetry();
      updateStatus("error");
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
    updateStatus("idle");
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
    updateStatus("idle");
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
    updateStatus("reconnecting");
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

export default LocalWebcamPublisher;
