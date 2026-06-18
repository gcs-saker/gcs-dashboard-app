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
      audioPlaybackState: "receiving",
      audioDiagnosticMessage: "오디오 수신 중",
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
    expect(screen.getByText("오디오 수신")).toHaveAttribute("title", "오디오 수신 중");
  });

  test("explains a talkback WHEP 404 as a missing operator audio sender", async () => {
    const user = userEvent.setup();
    useWhepPlayback.mockReturnValue({
      videoRef: { current: null },
      status: "error",
      errorMessage: "WHEP request failed with 404",
      audioPlaybackState: "no-track",
      audioDiagnosticMessage: "오디오 트랙 없음",
    });

    render(<TalkbackAudioReceiver streamId="raw.local.webcam" />);

    await user.click(screen.getByRole("button", { name: "수신 시작" }));

    expect(screen.getByText("관제 음성 송신이 아직 시작되지 않았습니다. 대시보드에서 마이크 송신을 먼저 시작하세요.")).toBeInTheDocument();
    expect(screen.queryByText("WHEP request failed with 404")).not.toBeInTheDocument();
  });
});
