import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { TacticalLeafletMap } from "./TacticalLeafletMap";
import type { DashboardStreamSlot } from "../streamTypes";

const stream: DashboardStreamSlot = {
  id: "raw.local.webcam",
  title: "로컬 웹캠",
  status: "online",
  mode: "EO",
  detail: "closed network map test",
  streamPath: "raw.local.webcam",
  geometry: {
    lat: 35.871435,
    lng: 128.601445,
    altitudeM: 12,
    headingDeg: 24,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 24,
    fovDeg: 64,
    source: "telemetry",
  },
};

function mockMapRect() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 500,
    height: 500,
    left: 0,
    right: 1000,
    top: 0,
    width: 1000,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("TacticalLeafletMap", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("renders a closed-network map without external tile providers", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
    expect(screen.getByTestId("map-coordinate-source")).toHaveTextContent("실시간 GPS");
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("35.871435, 128.601445");
    expect(screen.getByRole("button", { name: /로컬 웹캠 위치/ })).toBeInTheDocument();
  });

  test("keeps zoom controls local to the offline renderer", () => {
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.click(screen.getByRole("button", { name: "지도 확대" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "지도 중심 초기화" }));
    fireEvent.change(screen.getByLabelText("지도 축척"), { target: { value: "1000" } });

    expect(screen.getByTestId("offline-tactical-map")).toBeInTheDocument();
    expect(screen.getByTestId("offline-map-center")).toHaveTextContent("축척 1 km");
  });

  test("shows the coordinate under the pointer", () => {
    mockMapRect();
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    fireEvent.pointerMove(screen.getByTestId("offline-tactical-map"), { clientX: 500, clientY: 250 });

    expect(screen.getByTestId("map-hover-coordinate")).toHaveTextContent("마우스 35.871435, 128.601445");
  });

  test("adds custom markers and builds a route from selected pins", async () => {
    const user = userEvent.setup();
    mockMapRect();
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    await user.click(screen.getByRole("button", { name: "커스텀 마커 추가" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "집결지 A");
    await user.click(screen.getByRole("button", { name: "추가" }));

    expect(screen.getByRole("button", { name: /집결지 A 커스텀 마커/ })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "커스텀 마커 추가" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "관측점 B");
    await user.clear(screen.getByLabelText("위도"));
    await user.type(screen.getByLabelText("위도"), "35.872000");
    await user.clear(screen.getByLabelText("경도"));
    await user.type(screen.getByLabelText("경도"), "128.602000");
    await user.click(screen.getByRole("button", { name: "추가" }));

    await user.click(screen.getByRole("button", { name: /집결지 A 커스텀 마커/ }));
    await user.click(screen.getByRole("button", { name: "경로 선택" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: /관측점 B 커스텀 마커/ }));
    await user.click(screen.getByRole("button", { name: "경로 선택" }));

    expect(screen.getByLabelText("선택 핀 경로")).toBeInTheDocument();
  });

  test("opens a floating asset status panel from a stream marker", async () => {
    const user = userEvent.setup();
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    await user.click(screen.getByRole("button", { name: /로컬 웹캠 위치/ }));

    expect(screen.getByLabelText("로컬 웹캠 상태")).toBeInTheDocument();
    expect(screen.getByText("정상")).toBeInTheDocument();
    expect(screen.getByText("미연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "조종 준비" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "마커 상태 닫기" }));
    expect(screen.queryByLabelText("로컬 웹캠 상태")).not.toBeInTheDocument();
  });

  test("unlocks and moves a custom marker by clicking the map", async () => {
    const user = userEvent.setup();
    mockMapRect();
    render(<TacticalLeafletMap selectedStream={stream} streams={[stream]} />);

    await user.click(screen.getByRole("button", { name: "커스텀 마커 추가" }));
    await user.clear(screen.getByLabelText("이름"));
    await user.type(screen.getByLabelText("이름"), "이동 핀");
    await user.click(screen.getByRole("button", { name: "추가" }));
    await user.click(screen.getByRole("button", { name: "고정 해제" }));
    await user.click(screen.getByRole("button", { name: "이동" }));

    fireEvent.click(screen.getByTestId("offline-tactical-map"), { clientX: 600, clientY: 240 });

    expect(screen.queryByText("지도 위치를 눌러 마커를 이동")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /이동 핀 커스텀 마커/ })).toHaveAttribute(
      "title",
      expect.stringContaining("128.602080"),
    );
  });
});
