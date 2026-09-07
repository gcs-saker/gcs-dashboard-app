import { describe, expect, test } from "vitest";

import { applyTalkbackOpusPolicy, inspectTalkbackAudioSettings } from "./talkbackAudioPolicy";

describe("talkbackAudioPolicy", () => {
  test("pins the selected Opus payload to the operational voice policy", () => {
    const offer = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 109\r\na=rtpmap:109 opus/48000/2\r\na=fmtp:109 useinbandfec=0\r\n";

    expect(applyTalkbackOpusPolicy(offer)).toContain(
      "a=fmtp:109 minptime=20;useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;maxaveragebitrate=32000",
    );
    expect(applyTalkbackOpusPolicy(offer)).toContain("a=ptime:20");
    expect(applyTalkbackOpusPolicy(offer)).not.toContain("useinbandfec=0");
  });

  test("does not invent a codec policy when Opus is absent", () => {
    const offer = "v=0\r\nm=audio 9 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\n";

    expect(applyTalkbackOpusPolicy(offer)).toBe(offer);
  });

  test("reports browser capture settings that differ from the requested profile", () => {
    expect(inspectTalkbackAudioSettings({ sampleRate: 44_100, channelCount: 2, echoCancellation: false })).toEqual({
      compliant: false,
      mismatches: ["sampleRate=44100", "channelCount=2", "echoCancellation=false"],
    });
    expect(inspectTalkbackAudioSettings({ sampleRate: 48_000, channelCount: 1, echoCancellation: true })).toEqual({
      compliant: true,
      mismatches: [],
    });
  });
});

