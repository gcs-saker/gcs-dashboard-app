import { useMemo, useRef, useState } from "react";
import {
  DEFAULT_CAMERA_DEVICE_ID,
  DEFAULT_MICROPHONE_DEVICE_ID,
  type AudioCaptureMode,
  type PublisherStepId,
  type WebcamPublisherStatus,
} from "@streaming/publisher/publisherContracts";
import type { PublisherSessionRefs } from "@streaming/publisher/publisherSessionCleanup";

export function useLocalWebcamPublisherRuntime(streamId: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const statusRef = useRef<WebcamPublisherStatus>("idle");
  const [status, setStatus] = useState<WebcamPublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<PublisherStepId | null>(null);
  const [audioMode, setAudioMode] = useState<AudioCaptureMode>("low-latency");
  const [selectedStreamId, setSelectedStreamId] = useState(streamId);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(DEFAULT_CAMERA_DEVICE_ID);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(DEFAULT_MICROPHONE_DEVICE_ID);
  const sessionRefs: PublisherSessionRefs = useMemo(() => ({
    peerConnectionRef,
    reconnectAttemptRef,
    reconnectTimeoutRef,
    streamRef,
    videoRef,
  }), []);

  return {
    audioMode,
    errorMessage,
    failedStep,
    peerConnectionRef,
    reconnectAttemptRef,
    reconnectTimeoutRef,
    selectedAudioDeviceId,
    selectedStreamId,
    selectedVideoDeviceId,
    sessionRefs,
    setAudioMode,
    setErrorMessage,
    setFailedStep,
    setSelectedAudioDeviceId,
    setSelectedStreamId,
    setSelectedVideoDeviceId,
    setStatus,
    status,
    statusRef,
    streamRef,
    videoRef,
  };
}

export type LocalWebcamPublisherRuntime = ReturnType<typeof useLocalWebcamPublisherRuntime>;
