import { describe, expect, test } from "vitest";

import { streamIdToMediaPath, talkbackMediaPath, talkbackWhepUrl, talkbackWhipUrl } from "./talkbackRoutes";

describe("talkbackRoutes", () => {
  test("maps stream IDs to stable MediaMTX talkback paths", () => {
    expect(streamIdToMediaPath("raw.sample.front")).toBe("raw/sample/front");
    expect(talkbackMediaPath("raw.sample.front", "operator01")).toBe("talkback/raw/sample/front/operator01");
    expect(talkbackWhipUrl("raw.sample.front", "operator01")).toBe("/webrtc/talkback/raw/sample/front/operator01/whip");
    expect(talkbackWhepUrl("raw.sample.front", "operator01")).toBe("/webrtc/talkback/raw/sample/front/operator01/whep");
  });
});
