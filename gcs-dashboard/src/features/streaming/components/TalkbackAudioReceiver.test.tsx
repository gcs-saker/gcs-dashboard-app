import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { TalkbackAudioReceiver } from "./TalkbackAudioReceiver";

const useWhepPlayback = vi.fn();

vi.mock("@streaming/hooks/playback/useWhepPlayback", () => ({
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
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      playbackUrls: { webrtc: "/webrtc/authorized-talkback/whep?playbackToken=short-lived", hls: null },
    })));

    render(<TalkbackAudioReceiver streamId="raw.sample.front" />);

    expect(useWhepPlayback).toHaveBeenLastCalledWith({ whepUrl: null, isOnline: false });

    await user.click(screen.getByRole("button", { name: "수신 시작" }));

    await waitFor(() => expect(useWhepPlayback).toHaveBeenLastCalledWith({
      whepUrl: "/webrtc/authorized-talkback/whep?playbackToken=short-lived",
      isOnline: true,
    }));
    expect(screen.getByLabelText("관제 음성 WebRTC 수신")).toBeInTheDocument();
    expect(screen.queryByText(/playbackToken/)).not.toBeInTheDocument();
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
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      playbackUrls: { webrtc: "/webrtc/authorized-talkback/whep?playbackToken=short-lived", hls: null },
    })));

    render(<TalkbackAudioReceiver streamId="raw.local.webcam" />);

    await user.click(screen.getByRole("button", { name: "수신 시작" }));

    expect(screen.getByText("관제 음성 송신이 아직 시작되지 않았습니다. 대시보드에서 마이크 송신을 먼저 시작하세요.")).toBeInTheDocument();
    expect(screen.queryByText("WHEP request failed with 404")).not.toBeInTheDocument();
  });
});
