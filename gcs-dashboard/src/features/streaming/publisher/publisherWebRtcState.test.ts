import { describe, expect, it } from "vitest";
import {
  isPublisherPeerConnectionFailed,
  isPublisherPeerConnectionReady,
} from "./publisherWebRtcState";

describe("publisherWebRtcState", () => {
  it("detects ready peer connection states", () => {
    expect(isPublisherPeerConnectionReady(peer("connected", "checking"))).toBe(true);
    expect(isPublisherPeerConnectionReady(peer("connecting", "completed"))).toBe(true);
    expect(isPublisherPeerConnectionReady(peer("connecting", "connected"))).toBe(true);
    expect(isPublisherPeerConnectionReady(peer("connecting", "checking"))).toBe(false);
  });

  it("detects failed peer connection states", () => {
    expect(isPublisherPeerConnectionFailed(peer("failed", "checking"))).toBe(true);
    expect(isPublisherPeerConnectionFailed(peer("connecting", "failed"))).toBe(true);
    expect(isPublisherPeerConnectionFailed(peer("connected", "connected"))).toBe(false);
  });
});

function peer(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
): RTCPeerConnection {
  return { connectionState, iceConnectionState } as RTCPeerConnection;
}
