import { useCallback, useRef, useState } from "react";

import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "@auth/authApi";
import {
  buildPublisherGpsTelemetryPayload,
  type PublisherGpsTelemetryPayload,
} from "@streaming/publisher/publisherGpsTelemetry";
import type { PublisherGpsStatus } from "@streaming/publisher/publisherContracts";
import { STREAM_JSON_HEADERS } from "@streaming/streamingProtocolHeaders";

const GPS_IDLE_DETAIL = "GPS 대기";
const GPS_UNSUPPORTED_DETAIL = "이 브라우저에서는 GPS 위치를 지원하지 않습니다.";
const GPS_PERMISSION_DETAIL = "GPS 권한 요청 중";
const GPS_SEND_FAILED_DETAIL = "GPS 전송 실패";
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

export function usePublisherGpsTelemetry({
  fetcher,
  geolocation,
  streamId,
}: UsePublisherGpsTelemetryOptions) {
  const gpsWatchIdRef = useRef<number | null>(null);
  const publishStartedAtRef = useRef<number | null>(null);
  const pendingPositionRef = useRef<GeolocationPosition | null>(null);
  const sendInFlightRef = useRef(false);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const [gpsStatus, setGpsStatus] = useState<PublisherGpsStatus>("idle");
  const [gpsDetail, setGpsDetail] = useState(GPS_IDLE_DETAIL);

  const elapsedPublishSeconds = useCallback((): number => {
    if (!publishStartedAtRef.current) return 0;
    return Math.max(0, Math.floor((Date.now() - publishStartedAtRef.current) / 1000));
  }, []);

  const flushGpsTelemetry = useCallback(async (): Promise<void> => {
    if (sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    const sessionAbort = sessionAbortRef.current;
    try {
      while (pendingPositionRef.current && sessionAbort && !sessionAbort.signal.aborted) {
        const position = pendingPositionRef.current;
        pendingPositionRef.current = null;
        const response = await authenticatedFetch(
          apiUrl(DASHBOARD_API_ROUTES.telemetryIngest),
          {
            method: "POST",
            headers: STREAM_JSON_HEADERS,
            body: JSON.stringify(buildPublisherGpsTelemetryPayload(position, streamId, elapsedPublishSeconds())),
            signal: sessionAbort.signal,
          },
          fetcher,
        );
        if (!response.ok) {
          setGpsStatus("error");
          setGpsDetail(`${GPS_SEND_FAILED_DETAIL} ${response.status}`);
        }
      }
    } catch (error) {
      if (!sessionAbort?.signal.aborted) {
        setGpsStatus("error");
        setGpsDetail(error instanceof Error ? error.message : GPS_SEND_FAILED_DETAIL);
      }
    } finally {
      sendInFlightRef.current = false;
      if (pendingPositionRef.current && !sessionAbortRef.current?.signal.aborted) {
        queueMicrotask(() => void flushGpsTelemetry());
      }
    }
  }, [elapsedPublishSeconds, fetcher, streamId]);

  const queueGpsTelemetry = useCallback((position: GeolocationPosition): void => {
    pendingPositionRef.current = position;
    void flushGpsTelemetry();
  }, [flushGpsTelemetry]);

  const handleGpsPosition = useCallback(
    (position: GeolocationPosition): void => {
      setGpsStatus("active");
      setGpsDetail(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
      queueGpsTelemetry(position);
    },
    [queueGpsTelemetry],
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
    publishStartedAtRef.current = null;
    pendingPositionRef.current = null;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    setGpsStatus("idle");
    setGpsDetail(GPS_IDLE_DETAIL);
  }, [geolocation]);

  const startGpsTelemetry = useCallback((): void => {
    if (!geolocation) {
      setGpsStatus("unavailable");
      setGpsDetail(GPS_UNSUPPORTED_DETAIL);
      return;
    }

    stopGpsTelemetry();
    sessionAbortRef.current = new AbortController();
    publishStartedAtRef.current = Date.now();
    setGpsStatus("requesting");
    setGpsDetail(GPS_PERMISSION_DETAIL);
    geolocation.getCurrentPosition(handleGpsPosition, handleGpsError, GPS_POSITION_OPTIONS);
    gpsWatchIdRef.current = geolocation.watchPosition(handleGpsPosition, handleGpsError, GPS_POSITION_OPTIONS);
  }, [geolocation, handleGpsError, handleGpsPosition, stopGpsTelemetry]);

  return {
    gpsDetail,
    gpsStatus,
    startGpsTelemetry,
    stopGpsTelemetry,
  } as const;
}

export type { PublisherGpsTelemetryPayload };
