import { describe, expect, test } from "vitest";
import { createTalkbackReceipt, receiptStateForPlayback } from "./talkbackReceipt";

describe("talkbackReceipt", () => {
  test("maps receiver playback states to stable acknowledgement states", () => {
    expect(receiptStateForPlayback(true, "receiving", null)).toBe("audio_playing");
    expect(receiptStateForPlayback(true, "track-muted", null)).toBe("muted");
    expect(receiptStateForPlayback(true, "playback-blocked", null)).toBe("playback_blocked");
    expect(receiptStateForPlayback(true, null, "whep_failed")).toBe("failed");
    expect(receiptStateForPlayback(false, null, null)).toBe("ended");
  });

  test("creates a versioned UTC receipt without media or credential data", () => {
    const receipt = createTalkbackReceipt(
      "raw.mobile.front",
      "audio_playing",
      undefined,
      new Date("2026-10-02T00:00:00Z"),
    );

    expect(receipt).toEqual({
      schemaVersion: "gcs-saker.talkback-receipt.v1",
      streamId: "raw.mobile.front",
      state: "audio_playing",
      occurredAt: "2026-10-02T00:00:00.000Z",
    });
  });
});
