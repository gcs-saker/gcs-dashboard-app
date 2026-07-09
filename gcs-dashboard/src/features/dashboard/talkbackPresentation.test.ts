import { describe, expect, test } from "vitest";
import { DASHBOARD_STREAM_MODE, DASHBOARD_STREAM_STATUS } from "@/features/stateContracts";
import {
  buildTalkbackSelectionViewModel,
  formatTalkbackMicLevel,
  isTalkbackActive,
  talkbackStatusText,
} from "./talkbackPresentation";
import type { DashboardStreamSlot } from "./streamTypes";

const STREAMS: DashboardStreamSlot[] = [
  {
    detail: "front",
    id: "slot-1",
    mode: DASHBOARD_STREAM_MODE.eo,
    status: DASHBOARD_STREAM_STATUS.online,
    streamPath: "raw.mobile.front",
    title: "전방",
  },
  {
    detail: "empty",
    id: "slot-2",
    mode: DASHBOARD_STREAM_MODE.eo,
    status: DASHBOARD_STREAM_STATUS.offline,
    streamPath: null,
    title: "빈 슬롯",
  },
];

describe("talkbackPresentation", () => {
  test("builds selected stream paths and readable target names", () => {
    expect(buildTalkbackSelectionViewModel(STREAMS, ["raw.mobile.front"])).toMatchObject({
      selectedStreamPaths: ["raw.mobile.front"],
      targetsText: "front",
    });
  });

  test("formats talkback status and mic level consistently", () => {
    expect(isTalkbackActive("idle")).toBe(false);
    expect(isTalkbackActive("requesting-mic")).toBe(true);
    expect(isTalkbackActive("active")).toBe(true);
    expect(formatTalkbackMicLevel(null)).toBe("대기");
    expect(formatTalkbackMicLevel(0.416)).toBe("42%");
    expect(talkbackStatusText("error")).toBe("송신 오류");
  });
});
