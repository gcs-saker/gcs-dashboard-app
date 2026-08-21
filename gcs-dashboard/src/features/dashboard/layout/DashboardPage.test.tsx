import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AuthProvider } from "@auth/AuthProvider";
import { clearAuthSession, storeAuthSession } from "@auth/authStorage";
import { createDashboardQueryClient } from "@features/queryClient";
import { DashboardPage } from "@dashboard/layout/DashboardPage";
import { SAMPLE_DASHBOARD_STREAMS } from "@dashboard/stories/dashboardSampleStreams";

vi.mock("@dashboard/hooks/assets/useAccessibleGroupInventory", () => ({
  useAccessibleGroupInventory: () => undefined,
}));

function renderDashboard() {
  const queryClient = createDashboardQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <DashboardPage initialStreams={SAMPLE_DASHBOARD_STREAMS} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    storeAuthSession({
      accessToken: "test-access-token",
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: "operator01", role: "operator", groupId: "co-a", securityVersion: 1,
        capabilities: { canView: true, canControl: true, canManage: false, canSendTalkback: true,
          canPublish: true, canManageMembers: false, canManageDevices: false } },
    });
  });

  afterEach(() => {
    clearAuthSession();
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/");
  });

  test("renders the field operations dashboard regions from the M2 dashboard", async () => {
    renderDashboard();

    expect(screen.getByRole("main", { name: "Field Ops Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "서버상태" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "운영설정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "웹캠 송출" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "마이크 송신" })).toBeEnabled();
    expect(screen.getAllByText("전방 EO").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "자산" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "지도 확대" }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지도 축소" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "자산트리" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "선택 스트림" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "서버 상태 상세 / 연결상태 / 헬스체크" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "지오메트리 / 텔레메트리" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운용 요약" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "음성 파형 분석" })).toBeInTheDocument();
    expect(screen.getByLabelText("최근 상태")).toBeInTheDocument();
    expect(screen.getByText("선택 스트림 품질")).toBeInTheDocument();
    expect(screen.getByText("현재 선택")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI 결과" })).not.toBeInTheDocument();
  });

  test("applies motion kill switch from operations settings", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "운영설정" }));
    await user.click(await screen.findByRole("button", { name: "화면 효과" }, { timeout: 10000 }));
    await user.click(screen.getByRole("radio", { name: /효과 끄기/ }));

    expect(screen.getByRole("main", { name: "Field Ops Dashboard" })).toHaveAttribute("data-motion", "off");
    expect(document.documentElement).toHaveAttribute("data-motion", "off");
  });

  test("marks dashboard regions with widget ids for custom layout editing", async () => {
    const user = userEvent.setup();
    const { container } = renderDashboard();

    expect(container.querySelector('[data-widget-id="tactical-map"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="selected-stream"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="stream-grid"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="ops-summary"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="telemetry-panel"]')).toBeInTheDocument();
    expect(container.querySelector('[data-widget-id="ai-results"]')).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "자산" }));

    expect(container.querySelector('[data-widget-id="asset-tree"]')).toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: "자산" }));
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

  test("shows all dashboard stream slots and changes the selected stream", async () => {
    const user = userEvent.setup();
    renderDashboard();

    expect(screen.getByRole("button", { name: "스트리밍 1 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 2 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 3 선택" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "스트리밍 4 선택" })).toBeInTheDocument();
    expect(screen.getAllByText("전방 EO").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "스트리밍 3 선택" }));

    expect(screen.getAllByText("AI 감지 overlay").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("스트리밍 3 · AI 감지 overlay")).toBeInTheDocument();
    expect(screen.getByLabelText("최근 상태")).toHaveTextContent("AI 감지 overlay 선택됨");
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 3 기본 좌표 84deg / FOV 82deg");
    const telemetryPanel = screen.getByLabelText("지오메트리 / 텔레메트리");
    expect(within(telemetryPanel).getAllByText("AI 감지 overlay").length).toBeGreaterThanOrEqual(1);
    const compass = within(telemetryPanel).getByLabelText("기체 방위와 지도 기준 방위");
    expect(compass).toHaveTextContent("기체 084deg");
    expect(compass).toHaveTextContent("지도 084deg");
    expect(compass).toHaveTextContent("차이 0deg");
    expect(within(telemetryPanel).getAllByText("기체 방위").length).toBeGreaterThanOrEqual(1);
    expect(within(telemetryPanel).getAllByText("지도 기준").length).toBeGreaterThanOrEqual(1);
    expect(within(telemetryPanel).getByText("35.866900")).toBeInTheDocument();
    expect(within(telemetryPanel).getByText("128.593100")).toBeInTheDocument();
    expect(within(telemetryPanel).getByText("기본 좌표")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "스트리밍 3 스트림 연결" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "취소" }));
  });

  test("selects a stream from the tactical map pin without opening the connect dialog", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole("button", { name: "스트리밍 3 위치 35.866900, 128.593100" }));

    expect(screen.getByText("스트리밍 3 · AI 감지 overlay")).toBeInTheDocument();
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 3 기본 좌표 84deg / FOV 82deg");
    expect(screen.getByText("지도 핀 스트림 선택됨")).toBeInTheDocument();
    expect(screen.getByLabelText("스트리밍 3 단말 정보")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "스트리밍 3 스트림 연결" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("dialog", { name: "스트리밍 4 스트림 연결" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /DRN-01 전방 EO/ }));

    expect(screen.queryByRole("dialog", { name: "스트리밍 4 스트림 연결" })).not.toBeInTheDocument();
    expect(screen.getAllByText("DRN-01 전방 EO").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 4 기본 좌표 130deg / FOV 72deg");
    expect(screen.getByRole("status")).toHaveTextContent("스트림 연결됨");

    await user.click(screen.getByRole("button", { name: "스트리밍 4 선택" }));
    await user.click(screen.getByRole("button", { name: "스트림 연결 해제" }));

    expect(screen.getAllByText("스트림 미선택").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status")).toHaveTextContent("스트림 연결 해제됨");
  });

  test("renders operational status placeholders needed before live backend wiring", () => {
    renderDashboard();

    expect(screen.getByText("GPS")).toBeInTheDocument();
    expect(screen.getByText("Talkback")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "음성 파형 분석" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI 결과" })).not.toBeInTheDocument();
  });

  test("moves server status into a standalone page", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "서버상태" }));

    expect(screen.getByRole("heading", { name: "서버 상태" })).toBeInTheDocument();
    expect(screen.getByLabelText("상태 시안")).toBeInTheDocument();
    const serviceCards = screen.getByLabelText("서비스 상태 카드");
    expect(within(serviceCards).getByText("API")).toBeInTheDocument();
    expect(within(serviceCards).getByText("Signaling")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "장애 영향 범위" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "네트워크 RTT 추세" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "운영 진단" })).toBeInTheDocument();
    expect(screen.getByText("최저")).toBeInTheDocument();
    expect(screen.getByText("평균")).toBeInTheDocument();
    expect(screen.getByText("최고")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "서버 상태 상세 / 연결상태 / 헬스체크" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "서비스 의존 구조도" })).not.toBeInTheDocument();
  });

  test("renders CCTV as a configurable channel wall", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "CCTV" }));

    expect(screen.getByRole("heading", { name: "통합 CCTV 월" })).toBeInTheDocument();
    expect(screen.getByText(/16\s*채널 감시 레이아웃/)).toBeInTheDocument();
    expect(screen.getByText("CCTV 16")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "스트림 선택" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "5x5" }));

    expect(screen.getByText(/25\s*채널 감시 레이아웃/)).toBeInTheDocument();
    expect(screen.getByText("CCTV 25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "스트림 선택" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3x3" }));

    expect(screen.getByText(/9\s*채널 감시 레이아웃/)).toBeInTheDocument();
    expect(screen.getByText("CCTV 09")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "스트림 선택" })).not.toBeInTheDocument();
  });

  test("opens the device change dialog from empty CCTV 5x5 channels", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "CCTV" }));
    await user.click(screen.getByRole("button", { name: "5x5" }));
    await user.click(screen.getByRole("button", { name: "CCTV 25 선택" }));

    expect(screen.getByRole("dialog", { name: "CCTV 25 스트림 연결" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /DRN-01 전방 EO/ }));

    expect(screen.queryByRole("dialog", { name: "CCTV 25 스트림 연결" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CCTV 25 선택" })).toHaveTextContent("DRN-01 전방 EO");
    expect(screen.getByRole("status")).toHaveTextContent("스트림 연결됨");
  });

  test("only offers online registry streams without an address input", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "CCTV" }));
    await user.click(screen.getByRole("button", { name: "CCTV 09 선택" }));

    const dialog = screen.getByRole("dialog", { name: "CCTV 09 스트림 연결" });
    expect(dialog).toBeInTheDocument();

    expect(within(dialog).queryByText("스트림 주소 / Path")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "주소 연결" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /DRN-01 전방 EO/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /DRN-02 열화상/ })).not.toBeInTheDocument();
  });

  test("renders hierarchical asset tree nodes", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "자산" }));

    expect(screen.getByText("GCS-SAKER")).toBeInTheDocument();
    expect(screen.getAllByText("전방 EO").length).toBeGreaterThan(0);
    expect(screen.getAllByText("후방 AI").length).toBeGreaterThan(0);
  });

  test("selects a stream from the asset tree without opening the connect dialog", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "자산" }));
    await user.click(screen.getByRole("button", { name: "후방 AI" }));

    expect(screen.getByText("스트리밍 3 · AI 감지 overlay")).toBeInTheDocument();
    expect(screen.getByTestId("map-focus-label")).toHaveTextContent("스트리밍 3 기본 좌표 84deg / FOV 82deg");
    expect(screen.getByText("자산트리 스트림 선택됨")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "스트리밍 3 스트림 연결" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "자산트리" })).not.toBeInTheDocument();
  });

  test("clears the JWT session when logging out", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(window.localStorage.getItem("gcs_saker_access_token")).toBeNull();
    expect(window.location.pathname).toBe("/login");
  });

  test("opens time sync settings from the operations settings tab", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        mode: "public",
        sourceHost: "pool.ntp.org",
        sourcePort: 123,
        driftWarnMs: 1000,
        updatedAt: "1970-01-01T00:00:00Z",
        updatedBy: "system",
        serverTime: "2026-06-01T00:00:00Z",
        monotonicMs: 42000,
        timezone: "UTC",
        checkedAt: "2026-06-01T00:00:00Z",
        health: "ok",
        message: "pool.ntp.org:123 기준으로 시간 소스가 설정되었습니다.",
      }),
    } as Response)));
    renderDashboard();

    await user.click(screen.getByRole("button", { name: "운영설정" }));

    expect(await screen.findByLabelText("시간 동기화 설정")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "설정 저장" })).toBeInTheDocument();
  });
});
