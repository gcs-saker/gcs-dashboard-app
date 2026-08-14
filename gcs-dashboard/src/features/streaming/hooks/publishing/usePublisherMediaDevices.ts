import { useCallback, useEffect, useRef, useState } from "react";

import type { PublisherDeviceStatus } from "@streaming/publisher/publisherContracts";
import { splitCaptureDevices } from "@streaming/publisher/publisherDeviceCatalog";

interface PublisherMediaDevicesState {
  audioInputs: MediaDeviceInfo[];
  deviceStatus: PublisherDeviceStatus;
  refreshMediaDevices: () => Promise<void>;
  videoInputs: MediaDeviceInfo[];
}

export function usePublisherMediaDevices(mediaDevices?: MediaDevices): PublisherMediaDevicesState {
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<PublisherDeviceStatus>("idle");
  const mountedRef = useRef(true);

  const refreshMediaDevices = useCallback(async (): Promise<void> => {
    if (!mediaDevices?.enumerateDevices) {
      if (mountedRef.current) setDeviceStatus("unavailable");
      return;
    }
    try {
      setDeviceStatus("loading");
      const devices = await mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;
      const captureDevices = splitCaptureDevices(devices);
      setVideoInputs(captureDevices.videoInputs);
      setAudioInputs(captureDevices.audioInputs);
      setDeviceStatus("loaded");
    } catch {
      if (mountedRef.current) setDeviceStatus("error");
    }
  }, [mediaDevices]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshMediaDevices();
    const handleDeviceChange = () => {
      void refreshMediaDevices();
    };
    mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);
    return () => {
      mountedRef.current = false;
      mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
    };
  }, [mediaDevices, refreshMediaDevices]);

  return {
    audioInputs,
    deviceStatus,
    refreshMediaDevices,
    videoInputs,
  };
}
