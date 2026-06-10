import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { TalkbackAudioReceiver } from "./TalkbackAudioReceiver";

const useWhepPlayback = vi.fn();

vi.mock("../hooks/useWhepPlayback", () => ({
  useWhepPlayback: (options: unknown) => useWhepPlayback(options),
}));

describe("TalkbackAudioReceiver", () => {
  test("starts receiving operator talkback audio through the selected stream WHEP path", async () => {
    const user = userEvent.setup();
    useWhepPlayback.mockReturnValue({
      videoRef: { current: null },
      status: "connecting",
      errorMessage: null,
    });

    render(<TalkbackAudioReceiver streamId="raw.sample.front" />);

    expect(useWhepPlayback).toHaveBeenLastCalledWith({ whepUrl: null, isOnline: false });

    await user.click(screen.getByRole("button", { name: "수신 시작" }));

    expect(useWhepPlayback).toHaveBeenLastCalledWith({
      whepUrl: "/webrtc/talkback/raw/sample/front/operator/whep",
      isOnline: true,
    });
    expect(screen.getByLabelText("관제 음성 WebRTC 수신")).toBeInTheDocument();
    expect(screen.getByText("/webrtc/talkback/raw/sample/front/operator/whep")).toBeInTheDocument();
  });
});
