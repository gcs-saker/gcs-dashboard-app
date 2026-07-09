import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimelineAndMetrics } from "./eventLog.stories";
import { AudioWaveform, MapMarkerPopup } from "./mapAndAudio.stories";
import { PlayerPlaceholders, StreamCards } from "./streamStates.stories";
import { ServiceCards } from "./systemStatus.stories";

describe("dashboard Ladle stories", () => {
  it("render stream state scenarios", () => {
    render(<StreamCards />);
    expect(screen.getByText("스트림 카드 상태")).toBeInTheDocument();
    expect(screen.getByText("재연결")).toBeInTheDocument();
    expect(screen.getByText("오류")).toBeInTheDocument();
  });

  it("render realtime player placeholder scenarios", () => {
    render(<PlayerPlaceholders />);
    expect(screen.getByText("플레이어 연결 상태")).toBeInTheDocument();
    expect(screen.getByText("스트림 재연결 중")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("주소 변경");
  });

  it("render system status scenarios", () => {
    render(<ServiceCards />);
    expect(screen.getByText("서버 상태 카드")).toBeInTheDocument();
    expect(screen.getByText("WHIP / WHEP / ICE")).toBeInTheDocument();
  });

  it("render event log scenarios", () => {
    render(<TimelineAndMetrics />);
    expect(screen.getByText("운영 이벤트 로그")).toBeInTheDocument();
    expect(screen.getByText("WHEP 세션이 비정상 종료되어 재연결 대기 상태로 전환했습니다.")).toBeInTheDocument();
  });

  it("render map and audio scenarios", () => {
    render(<MapMarkerPopup />);
    expect(screen.getByText("지도 마커 팝업")).toBeInTheDocument();
    expect(screen.getByText("35.871435, 128.601445")).toBeInTheDocument();

    render(<AudioWaveform />);
    expect(screen.getByRole("heading", { level: 1, name: "음성 파형 분석" })).toBeInTheDocument();
    expect(screen.getByText("srflx->host/UDP")).toBeInTheDocument();
  });
});
