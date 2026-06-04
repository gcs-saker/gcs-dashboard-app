const apiBaseUrl = normalizeLocalDevBaseUrl(import.meta.env.VITE_API_BASE_URL ?? "/api", "/api");
const authBaseUrl = normalizeLocalDevBaseUrl(
  import.meta.env.VITE_AUTH_API_BASE_URL ?? "/auth-policy/auth",
  "/auth-policy/auth",
);
const streamApiBaseUrl = normalizeLocalDevBaseUrl(import.meta.env.VITE_STREAM_API_BASE_URL ?? apiBaseUrl, "/api");
const hlsBaseUrl = normalizeLocalDevBaseUrl(import.meta.env.VITE_HLS_BASE_URL ?? "/hls", "/hls");
const defaultStreamId = import.meta.env.VITE_DEFAULT_STREAM_ID ?? "CID001";
const defaultStunUrl = import.meta.env.VITE_WEBRTC_STUN_URL ?? "stun:stun.l.google.com:19302";
const defaultMapProvider = import.meta.env.VITE_MAP_PROVIDER ?? "esri-satellite";
const defaultMapStyleUrl =
  import.meta.env.VITE_MAP_STYLE_URL
  ?? "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const localWebcamWhipUrl = normalizeLocalDevBaseUrl(
  import.meta.env.VITE_LOCAL_WEBCAM_WHIP_URL ?? "/webrtc/raw/local/webcam/whip",
  "/webrtc/raw/local/webcam/whip",
);

export type DashboardMapProvider = "esri-satellite" | "openfreemap" | "offline" | "custom";

export interface DashboardMapConfig {
  provider: DashboardMapProvider;
  styleUrl: string;
  attribution: string;
  requiresApiKey: boolean;
}

export const API_BASE_URL: string = apiBaseUrl;
export const AUTH_API_BASE_URL: string = authBaseUrl;
export const STREAM_API_BASE_URL: string = streamApiBaseUrl;
export const HLS_BASE_URL: string = hlsBaseUrl;
export const DEFAULT_STREAM_ID: string = defaultStreamId;
export const MAP_PROVIDER: DashboardMapProvider = parseDashboardMapProvider(defaultMapProvider);
export const MAP_STYLE_URL: string = defaultMapStyleUrl;
export const FALLBACK_MAP_CONFIG: DashboardMapConfig = Object.freeze({
  provider: MAP_PROVIDER,
  styleUrl: MAP_STYLE_URL,
  attribution: "Esri World Imagery",
  requiresApiKey: false,
});
export const LOCAL_WEBCAM_STREAM_ID = "raw.local.webcam";
export const LOCAL_WEBCAM_WHIP_URL: string = localWebcamWhipUrl;
export const WEBRTC_ICE_SERVERS: RTCIceServer[] = defaultStunUrl
  ? [{ urls: defaultStunUrl }]
  : [];

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL.replace(/\/$/, "")}${normalizedPath}`;
}

export function authUrl(path: string): string {
  return buildAuthUrl(AUTH_API_BASE_URL, path);
}

export function buildAuthUrl(authBaseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${authBaseUrl.replace(/\/$/, "")}${normalizedPath}`;
}

export function backendRootUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const apiBase = API_BASE_URL.replace(/\/$/, "");
  const rootBase = apiBase.endsWith("/api") ? apiBase.slice(0, -4) : apiBase;
  return `${rootBase}${normalizedPath}`;
}

export function apiV1Url(path: string): string {
  return buildApiV1Url(API_BASE_URL, path);
}

export function streamApiV1Url(path: string): string {
  return buildApiV1Url(STREAM_API_BASE_URL, path);
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

export function normalizeLocalDevBaseUrl(configuredUrl: string, fallbackPath: string): string {
  if (!isLocalDashboardOrigin()) return configuredUrl;

  try {
    const parsed = new URL(configuredUrl);
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      return fallbackPath;
    }
  } catch {
    return configuredUrl;
  }

  return configuredUrl;
}

function isLocalDashboardOrigin(): boolean {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function parseDashboardMapProvider(provider: string): DashboardMapProvider {
  if (
    provider === "esri-satellite"
    || provider === "openfreemap"
    || provider === "offline"
    || provider === "custom"
  ) {
    return provider;
  }
  return "custom";
}
