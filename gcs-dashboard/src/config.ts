const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const hlsBaseUrl = import.meta.env.VITE_HLS_BASE_URL ?? "/hls";
const defaultStreamId = import.meta.env.VITE_DEFAULT_STREAM_ID ?? "CID001";
const localWebcamWhipUrl =
  import.meta.env.VITE_LOCAL_WEBCAM_WHIP_URL ?? "http://127.0.0.1:8889/raw/local/webcam/whip";

export const API_BASE_URL: string = apiBaseUrl;
export const HLS_BASE_URL: string = hlsBaseUrl;
export const DEFAULT_STREAM_ID: string = defaultStreamId;
export const LOCAL_WEBCAM_STREAM_ID = "raw.local.webcam";
export const LOCAL_WEBCAM_WHIP_URL: string = localWebcamWhipUrl;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL.replace(/\/$/, "")}${normalizedPath}`;
}

export function apiV1Url(path: string): string {
  return buildApiV1Url(API_BASE_URL, path);
}

export function buildApiV1Url(apiBaseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiBase = apiBaseUrl.replace(/\/$/, "");
  const v1Base = apiBase.endsWith("/api") ? `${apiBase}/v1` : `${apiBase}/api/v1`;
  return `${v1Base}${normalizedPath}`;
}

export function hlsStreamUrl(streamId: string): string {
  return `${HLS_BASE_URL.replace(/\/$/, "")}/${streamId}/index.m3u8`;
}
