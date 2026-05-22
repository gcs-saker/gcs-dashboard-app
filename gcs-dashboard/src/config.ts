const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const hlsBaseUrl = import.meta.env.VITE_HLS_BASE_URL ?? "/hls";
const defaultStreamId = import.meta.env.VITE_DEFAULT_STREAM_ID ?? "CID001";

export const API_BASE_URL: string = apiBaseUrl;
export const HLS_BASE_URL: string = hlsBaseUrl;
export const DEFAULT_STREAM_ID: string = defaultStreamId;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL.replace(/\/$/, "")}${normalizedPath}`;
}

export function hlsStreamUrl(streamId: string): string {
  return `${HLS_BASE_URL.replace(/\/$/, "")}/${streamId}/index.m3u8`;
}
