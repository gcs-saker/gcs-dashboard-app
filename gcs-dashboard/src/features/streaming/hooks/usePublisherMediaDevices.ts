import { useCallback, useEffect, useState } from "react";

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

  const refreshMediaDevices = useCallback(async (): Promise<void> => {
    if (!mediaDevices?.enumerateDevices) {
      setDeviceStatus("unavailable");
      return;
    }
    try {
      setDeviceStatus("loading");
      const devices = await mediaDevices.enumerateDevices();
      const captureDevices = splitCaptureDevices(devices);
      setVideoInputs(captureDevices.videoInputs);
      setAudioInputs(captureDevices.audioInputs);
      setDeviceStatus("loaded");
    } catch {
      setDeviceStatus("error");
    }
  }, [mediaDevices]);

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
  }, [mediaDevices, refreshMediaDevices]);

  return {
    audioInputs,
    deviceStatus,
    refreshMediaDevices,
    videoInputs,
  };
}
