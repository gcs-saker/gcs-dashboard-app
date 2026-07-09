import { describe, expect, it } from "vitest";
import { isPublishedConnectionDisconnected } from "./publisherConnectionState";

describe("publisherConnectionState", () => {
  it("detects disconnected publish peer states", () => {
    expect(isPublishedConnectionDisconnected(peer("connected", "connected"))).toBe(false);
    expect(isPublishedConnectionDisconnected(peer("failed", "connected"))).toBe(true);
    expect(isPublishedConnectionDisconnected(peer("connected", "disconnected"))).toBe(true);
  });
});

function peer(
  connectionState: RTCPeerConnectionState,
  iceConnectionState: RTCIceConnectionState,
): RTCPeerConnection {
  return { connectionState, iceConnectionState } as RTCPeerConnection;
}
