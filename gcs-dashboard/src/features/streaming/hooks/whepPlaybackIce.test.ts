import { describe, expect, test } from "vitest";

import type { WebRTCIceCandidateStats } from "../types";
import { incrementIceCandidateStats } from "./whepPlaybackIce";

const emptyStats: WebRTCIceCandidateStats = {
  total: 0,
  host: 0,
  srflx: 0,
  relay: 0,
  prflx: 0,
  unknown: 0,
  udp: 0,
  tcp: 0,
};

describe("whepPlaybackIce", () => {
  test("counts candidate type and protocol from browser candidate fields", () => {
    const candidate = {
      type: "srflx",
      protocol: "udp",
      candidate: "candidate:1 1 udp 2122260223 10.0.0.1 56143 typ srflx",
    } as RTCIceCandidate;

    expect(incrementIceCandidateStats(emptyStats, candidate)).toMatchObject({
      total: 1,
      srflx: 1,
      udp: 1,
    });
  });

  test("falls back to parsing raw candidate text when protocol fields are missing", () => {
    const candidate = {
      type: undefined,
      protocol: undefined,
      candidate: "candidate:1 1 tcp 1518280447 10.0.0.1 9 typ host tcptype active",
    } as unknown as RTCIceCandidate;

    expect(incrementIceCandidateStats(emptyStats, candidate)).toMatchObject({
      total: 1,
      unknown: 1,
      tcp: 1,
    });
  });
});
