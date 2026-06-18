import { describe, expect, test } from "vitest";

import {
  apiV1Url,
  authUrl,
  backendRootUrl,
  buildApiV1Url,
  buildAuthUrl,
  normalizeLocalDevBaseUrl,
  MAP_PROVIDER,
  MAP_STYLE_URL,
  streamApiV1Url,
  SHOULD_USE_EXTERNAL_ASSET_OPTIMIZATION,
  STATIC_ASSET_DELIVERY_MODE,
  WEBRTC_ICE_SERVERS,
} from "./config";

describe("config API URL helpers", () => {
  test("keeps the default /api base compatible with v1 routes", () => {
    expect(apiV1Url("/streams/raw.sample.front/playback")).toBe(
      "/api/v1/streams/raw.sample.front/playback",
    );
    expect(streamApiV1Url("/streams")).toBe("/api/v1/streams");
  });

  test("adds the /api/v1 prefix when VITE_API_BASE_URL points to the backend origin", () => {
    expect(buildApiV1Url("http://127.0.0.1:8026", "/streams")).toBe(
      "http://127.0.0.1:8026/api/v1/streams",
    );
  });

  test("does not duplicate /api when the configured base already includes it", () => {
    expect(buildApiV1Url("https://gcs.example.test/api", "streams")).toBe(
      "https://gcs.example.test/api/v1/streams",
    );
  });

  test("can point stream endpoints to the Go media-control cutover path", () => {
    expect(buildApiV1Url("/media-control", "/streams/raw.local.webcam/playback")).toBe(
      "/media-control/api/v1/streams/raw.local.webcam/playback",
    );
  });

  test("builds root backend probes outside the /api edge namespace", () => {
    expect(backendRootUrl("/healthz")).toBe("/healthz");
  });

  test("keeps auth endpoints on the Spring Kotlin auth-policy path by default", () => {
    expect(authUrl("/login")).toBe("/auth-policy/auth/login");
    expect(authUrl("refresh")).toBe("/auth-policy/auth/refresh");
  });

  test("can point auth endpoints to the Spring Kotlin auth-policy cutover path", () => {
    expect(buildAuthUrl("/auth-policy/auth", "/me")).toBe("/auth-policy/auth/me");
  });

  test("rewrites direct localhost backend base to the dev-server proxy path on local dashboard origin", () => {
    expect(normalizeLocalDevBaseUrl("http://localhost:8001", "/api")).toBe("/api");
    expect(normalizeLocalDevBaseUrl("http://127.0.0.1:8888", "/hls")).toBe("/hls");
  });

  test("keeps remote HTTPS API base unchanged on local dashboard origin", () => {
    expect(normalizeLocalDevBaseUrl("https://a4ai.tplinkdns.com/api", "/api")).toBe(
      "https://a4ai.tplinkdns.com/api",
    );
  });

  test("declares a STUN server for browser ICE candidate gathering", () => {
    expect(WEBRTC_ICE_SERVERS).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
  });

  test("defaults to the public satellite provider for connected networks", () => {
    expect(MAP_PROVIDER).toBe("esri-satellite");
    expect(MAP_STYLE_URL).toBe("https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}");
  });

  test("defaults static assets to offline bundle mode for closed network delivery", () => {
    expect(STATIC_ASSET_DELIVERY_MODE).toBe("offline-bundle");
    expect(SHOULD_USE_EXTERNAL_ASSET_OPTIMIZATION).toBe(false);
  });
});
