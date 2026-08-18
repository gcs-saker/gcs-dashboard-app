import { describe, expect, test } from "vitest";

import { EMPTY_AUDIO_STATS } from "./whepPlaybackContracts";
import { audioStatsEqual, extractAudioStats } from "./whepAudioStats";

function statsReport(entries: Array<Record<string, unknown>>): RTCStatsReport {
  return {
    forEach(callback: (value: unknown) => void) {
      entries.forEach(callback);
    },
  } as unknown as RTCStatsReport;
}

describe("whepAudioStats", () => {
  test("extracts inbound audio and selected candidate pair metrics", () => {
    const report = statsReport([
      {
        id: "inbound-audio",
        type: "inbound-rtp",
        kind: "audio",
        audioLevel: 0.32,
        jitter: 0.014,
        jitterBufferDelay: 0.12,
        jitterBufferEmittedCount: 4,
        packetsLost: 2,
        packetsReceived: 120,
        concealedSamples: 9,
      },
      {
        id: "pair-1",
        type: "candidate-pair",
        selected: true,
        currentRoundTripTime: 0.053,
        localCandidateId: "local-1",
        remoteCandidateId: "remote-1",
      },
      { id: "local-1", type: "local-candidate", candidateType: "relay", protocol: "udp" },
      { id: "remote-1", type: "remote-candidate", candidateType: "srflx" },
    ]);

    expect(extractAudioStats(report)).toEqual({
      audioLevel: 0.32,
      waveform: [],
      jitterMs: 14,
      jitterBufferDelayMs: 30,
      packetsLost: 2,
      packetsReceived: 120,
      concealedSamples: 9,
      roundTripTimeMs: 53,
      localCandidateType: "relay",
      remoteCandidateType: "srflx",
      transportProtocol: "udp",
      relayFallbackReason: "local-direct-candidate-failed",
    });
  });

  test("falls back to empty nullable stats when the report has no audio data", () => {
    expect(extractAudioStats(statsReport([]))).toEqual(EMPTY_AUDIO_STATS);
  });

  test("classifies relay fallback reasons from candidate type combinations", () => {
    const bothRelay = extractAudioStats(statsReport([
      { id: "pair-1", type: "candidate-pair", nominated: true, localCandidateId: "local-1", remoteCandidateId: "remote-1" },
      { id: "local-1", type: "local-candidate", candidateType: "relay" },
      { id: "remote-1", type: "remote-candidate", candidateType: "relay" },
    ]));
    const hostFallback = extractAudioStats(statsReport([
      { id: "pair-1", type: "candidate-pair", state: "succeeded", localCandidateId: "local-1", remoteCandidateId: "remote-1" },
      { id: "local-1", type: "local-candidate", candidateType: "relay" },
      { id: "remote-1", type: "remote-candidate", candidateType: "host" },
    ]));

    expect(bothRelay.relayFallbackReason).toBe("both-peers-relayed");
    expect(hostFallback.relayFallbackReason).toBe("local-nat-or-firewall-fallback");
  });

  test("compares every audio stat field to avoid redundant UI dispatches", () => {
    expect(audioStatsEqual(EMPTY_AUDIO_STATS, EMPTY_AUDIO_STATS)).toBe(true);
    expect(audioStatsEqual(EMPTY_AUDIO_STATS, { ...EMPTY_AUDIO_STATS, packetsLost: 1 })).toBe(false);
    expect(audioStatsEqual(EMPTY_AUDIO_STATS, { ...EMPTY_AUDIO_STATS, relayFallbackReason: "relay-selected" })).toBe(false);
  });
});
