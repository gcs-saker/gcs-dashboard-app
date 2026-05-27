import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { AuthProvider } from "../auth/AuthProvider";
import { clearAccessToken, storeAccessToken, storeUser } from "../auth/authStorage";
import { DashboardMvp } from "./DashboardMvp";

function renderDashboard() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <DashboardMvp />
      </AuthProvider>
    </BrowserRouter>,
  );
}

describe("DashboardMvp", () => {
  beforeEach(() => {
    storeAccessToken("test-access-token");
    storeUser({ username: "operator01", role: "operator" });
  });

  afterEach(() => {
    clearAccessToken();
    window.history.pushState({}, "", "/");
  });

  test("renders the field operations dashboard regions from the M2 MVP", () => {
    renderDashboard();

    expect(screen.getByRole("main", { name: "Field Ops Dashboard MVP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "웹캠 송출" })).toHaveAttribute("href", "/publisher");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지도 확대" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지도 축소" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "자산트리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "서버상태 / 연결상태 / 헬스체크" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지오메트리 / 텔레메트리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 결과" })).toBeInTheDocument();
  });

  test("marks dashboard regions with widget ids for custom layout editing", () => {
    const { container } = renderDashboard();

    expect(container.querySelector('[data-widget-id="asset-tree"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="tactical-map"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="selected-stream"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="stream-grid"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="system-status"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="telemetry-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="ai-results"]')).toBeInTheDocument();
  });

  test("opens and closes the widget add dialog from the dashboard toolbar", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "위젯 추가" }));

    expect(screen.getByRole("dialog", { name: "위젯 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /지도\s*420 x 340/ })).toHaveTextContent("숨기기");

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog", { name: "위젯 추가" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("레이아웃 변경 취소됨");
  });

  test("hides and restores widgets through the layout dialog", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByLabelText("지도 위젯 도구").querySelector('button[title="지도 숨김"]') as HTMLButtonElement);

    expect(screen.queryByRole("heading", { name: "지도" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("위젯 숨김");

    await user.click(screen.getByRole("button", { name: "위젯 추가" }));
    await user.click(screen.getByRole("button", { name: /지도\s*420 x 340/ }));
    await user.click(screen.getByRole("button", { name: "적용" }));

    expect(screen.getByRole("heading", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("레이아웃 변경 적용됨");
  });

  test("pins and pops out dashboard widgets", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const assetTools = screen.getByLabelText("자산트리 위젯 도구");
    const pinButton = assetTools.querySelector('button[title="자산트리 고정"]');
    const popoutButton = assetTools.querySelector('button[title="자산트리 팝아웃"]');

    expect(pinButton).not.toBeNull();
    expect(popoutButton).not.toBeNull();

    await user.click(pinButton as HTMLButtonElement);

    expect(pinButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("위젯 고정됨");

    await user.click(popoutButton as HTMLButtonElement);

    expect(screen.getByRole("dialog", { name: "자산트리 팝아웃" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "X" }));
    expect(screen.queryByRole("dialog", { name: "자산트리 팝아웃" })).not.toBeInTheDocument();
  });

  test("shows all MVP stream slots and changes the selected stream", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 2 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 3 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 4 선택" })).toBeInTheDocument();
    expect(screen.getAllByText("전방 EO / raw.sample.front")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "스트리밍 3 선택" }));

    expect(screen.getAllByText("AI 감지 overlay / raw.sample.rear")).toHaveLength(2);
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 3 focus 84deg / FOV 82deg");
    expect(screen.getByRole("dialog", { name: "스트리밍 3 장비 연결" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "변경 취소" }));
  });

  test("toggles the selected stream AI mode option", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const aiToggle = screen.getByRole("button", { name: "AI 모드" });
    await user.click(aiToggle);

    expect(aiToggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("AI 필터 준비됨")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("AI 모드 옵션 변경됨");
  });

  test("connects, cancels, and disconnects stream devices through the slot dialog", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "스트리밍 4 선택" }));

    expect(screen.getByRole("dialog", { name: "스트리밍 4 장비 연결" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /DRN-01 전방 EO/ }));

    expect(screen.queryByRole("dialog", { name: "스트리밍 4 장비 연결" })).not.toBeInTheDocument();
    expect(screen.getAllByText("DRN-01 전방 EO / raw.sample.front")).toHaveLength(2);
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 4 focus 130deg / FOV 72deg");
    expect(screen.getByRole("status")).toHaveTextContent("스트리밍 장비 연결됨");

    await user.click(screen.getByRole("button", { name: "스트리밍 4 선택" }));
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(screen.getAllByText("장비 미연결")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("스트리밍 장비 연결 해제됨");
  });

  test("renders operational status placeholders needed before live backend wiring", () => {
    renderDashboard();

    expect(screen.getByText("GCS-SAKER")).toBeInTheDocument();
    expect(screen.getByText("서버상태")).toBeInTheDocument();
    expect(screen.getByText("연결 자산")).toBeInTheDocument();
    expect(screen.getByText("탐지")).toBeInTheDocument();
    expect(screen.getByText("처리 지연")).toBeInTheDocument();
  });

  test("renders hierarchical asset tree nodes", () => {
    renderDashboard();

    expect(screen.getByText("전방 EO")).toBeInTheDocument();
    expect(screen.getByText("후방 AI")).toBeInTheDocument();
  });

  test("clears the JWT session when logging out", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(window.localStorage.getItem("gcs_saker_access_token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });
});
