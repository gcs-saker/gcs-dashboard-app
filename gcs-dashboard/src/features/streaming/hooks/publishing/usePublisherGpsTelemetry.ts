import { useCallback, useRef, useState } from "react";

import type { PublisherGpsTelemetryPayload } from "@streaming/publisher/publisherGpsTelemetry";
import type { PublisherGpsStatus } from "@streaming/publisher/publisherContracts";
import { usePublisherGpsSender } from "./usePublisherGpsSender";

const GPS_IDLE_DETAIL = "GPS 대기";
const GPS_UNSUPPORTED_DETAIL = "이 브라우저에서는 GPS 위치를 지원하지 않습니다.";
const GPS_PERMISSION_DETAIL = "GPS 권한 요청 중";
const GPS_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 2_000,
  timeout: 10_000,
};

interface UsePublisherGpsTelemetryOptions {
  fetcher: typeof fetch;
  geolocation?: Geolocation;
  streamId: string;
}

export function usePublisherGpsTelemetry(options: UsePublisherGpsTelemetryOptions) {
  const { fetcher, geolocation, streamId } = options;
  const gpsWatchIdRef = useRef<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<PublisherGpsStatus>("idle");
  const [gpsDetail, setGpsDetail] = useState(GPS_IDLE_DETAIL);

  const reportSendError = useCallback((message: string): void => {
    setGpsStatus("error");
    setGpsDetail(message);
  }, []);
  const { queuePosition, startSession, stopSession } = usePublisherGpsSender({ fetcher, onSendError: reportSendError, streamId });

  const handleGpsPosition = useCallback(
    (position: GeolocationPosition): void => {
      setGpsStatus("active");
      setGpsDetail(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
      queuePosition(position);
    },
    [queuePosition],
  );

  const handleGpsError = useCallback((error: GeolocationPositionError): void => {
    setGpsStatus("error");
    setGpsDetail(error.message || "GPS 위치를 받을 수 없습니다.");
  }, []);

  const stopGpsTelemetry = useCallback((): void => {
    if (gpsWatchIdRef.current !== null && geolocation) {
      geolocation.clearWatch(gpsWatchIdRef.current);
    }
    gpsWatchIdRef.current = null;
    stopSession();
    setGpsStatus("idle");
    setGpsDetail(GPS_IDLE_DETAIL);
  }, [geolocation, stopSession]);

  const startGpsTelemetry = useCallback((): void => {
    if (!geolocation) {
      setGpsStatus("unavailable");
      setGpsDetail(GPS_UNSUPPORTED_DETAIL);
      return;
    }

    stopGpsTelemetry();
    startSession();
    setGpsStatus("requesting");
    setGpsDetail(GPS_PERMISSION_DETAIL);
    geolocation.getCurrentPosition(handleGpsPosition, handleGpsError, GPS_POSITION_OPTIONS);
    gpsWatchIdRef.current = geolocation.watchPosition(handleGpsPosition, handleGpsError, GPS_POSITION_OPTIONS);
  }, [geolocation, handleGpsError, handleGpsPosition, startSession, stopGpsTelemetry]);

  return {
    gpsDetail,
    gpsStatus,
    startGpsTelemetry,
    stopGpsTelemetry,
  } as const;
}

export type { PublisherGpsTelemetryPayload };
