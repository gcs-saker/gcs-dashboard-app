import { describe, expect, test, vi } from "vitest";

import { loadWebRtcIceServers } from "./iceServers";

describe("loadWebRtcIceServers", () => {
  test("loads STUN and TURN servers from the backend ICE API", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { urls: "stun:stun.example.test:3478" },
        {
          urls: "turn:turn.example.test:3478?transport=udp",
          username: "gcs-turn",
          credential: "test-secret",
        },
      ],
    })) as unknown as typeof fetch;

    await expect(loadWebRtcIceServers(fetcher)).resolves.toEqual([
      { urls: "stun:stun.example.test:3478" },
      {
        urls: "turn:turn.example.test:3478?transport=udp",
        username: "gcs-turn",
        credential: "test-secret",
      },
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      "/media-control/api/v1/streams/ice-servers",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
      }),
    );
  });

  test("keeps direct STUN candidates first and limits TURN relay candidates", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          urls: "turn:turn-secondary.example.test:3478?transport=tcp",
          username: "gcs-turn",
          credential: "test-secret",
        },
        {
          urls: "turn:turn-primary.example.test:3478?transport=udp",
          username: "gcs-turn",
          credential: "test-secret",
        },
        { urls: "stun:stun.example.test:3478" },
      ],
    })) as unknown as typeof fetch;

    await expect(loadWebRtcIceServers(fetcher)).resolves.toEqual([
      { urls: "stun:stun.example.test:3478" },
      {
        urls: "turn:turn-primary.example.test:3478?transport=udp",
        username: "gcs-turn",
        credential: "test-secret",
      },
    ]);
  });

  test("reuses a short-lived ICE server response cache for the same fetcher", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { urls: "stun:stun.example.test:3478" },
        {
          urls: "turn:turn-primary.example.test:3478?transport=udp",
          username: "gcs-turn",
          credential: "test-secret",
        },
      ],
    })) as unknown as typeof fetch;

    await expect(loadWebRtcIceServers(fetcher)).resolves.toEqual([
      { urls: "stun:stun.example.test:3478" },
      {
        urls: "turn:turn-primary.example.test:3478?transport=udp",
        username: "gcs-turn",
        credential: "test-secret",
      },
    ]);
    await expect(loadWebRtcIceServers(fetcher)).resolves.toEqual([
      { urls: "stun:stun.example.test:3478" },
      {
        urls: "turn:turn-primary.example.test:3478?transport=udp",
        username: "gcs-turn",
        credential: "test-secret",
      },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("falls back to the static STUN server when the backend ICE API is unavailable", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 401,
    })) as unknown as typeof fetch;

    await expect(loadWebRtcIceServers(fetcher)).resolves.toEqual([
      { urls: "stun:stun.l.google.com:19302" },
    ]);
  });
});
