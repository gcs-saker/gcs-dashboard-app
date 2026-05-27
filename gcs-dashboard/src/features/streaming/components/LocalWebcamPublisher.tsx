import { useEffect, useRef, useState } from "react";

import { LOCAL_WEBCAM_STREAM_ID, LOCAL_WEBCAM_WHIP_URL, WEBRTC_ICE_SERVERS } from "../../../config";
import "./LocalWebcamPublisher.css";

type WebcamPublisherStatus = "idle" | "previewing" | "publishing" | "published" | "error" | "unsupported";

interface LocalWebcamPublisherProps {
  streamId?: string;
  whipUrl?: string;
  mediaDevices?: MediaDevices;
  peerConnectionFactory?: () => RTCPeerConnection;
  fetcher?: typeof fetch;
}

export function LocalWebcamPublisher({
  streamId = LOCAL_WEBCAM_STREAM_ID,
  whipUrl = LOCAL_WEBCAM_WHIP_URL,
  mediaDevices = navigator.mediaDevices,
  peerConnectionFactory = () => new RTCPeerConnection({ iceServers: WEBRTC_ICE_SERVERS }),
  fetcher = fetch,
}: LocalWebcamPublisherProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<WebcamPublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => () => stopAll(), []);

  async function startPreview(): Promise<void> {
    if (!mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorMessage("Camera capture is not supported in this browser.");
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setErrorMessage(null);
      setStatus("previewing");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Camera permission was denied.");
    }
  }

  async function publish(): Promise<void> {
    if (!streamRef.current) {
      setStatus("error");
      setErrorMessage("Start camera preview before publishing.");
      return;
    }

    try {
      setStatus("publishing");
      const peerConnection = peerConnectionFactory();
      peerConnectionRef.current = peerConnection;
      for (const track of streamRef.current.getTracks()) {
        peerConnection.addTrack(track, streamRef.current);
      }

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const sdp = peerConnection.localDescription?.sdp;
      if (!sdp) {
        throw new Error("Local WebRTC offer SDP was not created.");
      }

      const response = await fetcher(whipUrl, {
        method: "POST",
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: sdp,
      });
      if (!response.ok) {
        throw new Error(`WHIP publish failed with ${response.status}`);
      }

      const answer = await response.text();
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });
      setErrorMessage(null);
      setStatus("published");
    } catch (error) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Local webcam publish failed.");
    }
  }

  function stopAll(): void {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus("idle");
  }

  return (
    <main className="local-webcam-publisher" aria-label="Local webcam WebRTC test publisher">
      <header className="local-webcam-publisher__header">
        <h1>Local Webcam Publisher</h1>
        <span className="local-webcam-publisher__badge" role="status" aria-live="polite">
          {status}
        </span>
        <span className="local-webcam-publisher__stream">{streamId}</span>
        <span className="local-webcam-publisher__whip">{whipUrl}</span>
      </header>
      <div className="local-webcam-publisher__controls">
        <button type="button" onClick={() => void startPreview()} disabled={status === "publishing"}>
          Start preview
        </button>
        <button type="button" onClick={() => void publish()} disabled={status !== "previewing"}>
          Publish WebRTC
        </button>
        <button type="button" onClick={stopAll}>
          Stop
        </button>
      </div>
      <video ref={videoRef} className="local-webcam-publisher__video" aria-label="Local camera preview" autoPlay muted playsInline />
      {errorMessage ? <p className="local-webcam-publisher__error">{errorMessage}</p> : null}
    </main>
  );
}

export default LocalWebcamPublisher;
