import { describe, expect, it, vi } from "vitest";
import {
  clearPublisherReconnectTimer,
  clearPublisherSession,
  closePublisherPeerConnection,
  type PublisherSessionRefs,
} from "./publisherSessionCleanup";

describe("publisherSessionCleanup", () => {
  it("clears reconnect timer only when one is active", () => {
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout").mockImplementation(() => undefined);
    const reconnectTimeoutRef = { current: 10 };

    clearPublisherReconnectTimer(reconnectTimeoutRef);
    clearPublisherReconnectTimer(reconnectTimeoutRef);

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(reconnectTimeoutRef.current).toBeNull();
    clearTimeoutSpy.mockRestore();
  });

  it("closes publisher peer connection", () => {
    const close = vi.fn();
    const peerConnectionRef = { current: { close } as unknown as RTCPeerConnection };

    closePublisherPeerConnection(peerConnectionRef);

    expect(close).toHaveBeenCalledOnce();
    expect(peerConnectionRef.current).toBeNull();
  });

  it("clears all session resources by default", () => {
    const stop = vi.fn();
    const close = vi.fn();
    const video = document.createElement("video");
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    Object.defineProperty(video, "srcObject", { value: stream, writable: true });
    const refs: PublisherSessionRefs = {
      peerConnectionRef: { current: { close } as unknown as RTCPeerConnection },
      reconnectAttemptRef: { current: 3 },
      reconnectTimeoutRef: { current: null },
      streamRef: { current: stream },
      videoRef: { current: video },
    };

    clearPublisherSession(refs);

    expect(close).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
    expect(refs.reconnectAttemptRef.current).toBe(0);
    expect(refs.streamRef.current).toBeNull();
    expect(video.srcObject).toBeNull();
  });
});
