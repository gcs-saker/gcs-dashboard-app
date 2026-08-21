import { expect, test, type Page, type TestInfo } from "@playwright/test";

const PREVIEW_LOGIN_RESPONSE = Object.freeze({
  access_token: "playwright-preview-token",
  expires_in_minutes: 30,
  role: "operator",
  token_type: "bearer",
  username: "operator01",
  group_id: "co-a",
  securityVersion: 1,
  capabilities: {
    canView: true,
    canControl: true,
    canManage: false,
    canSendTalkback: true,
    canPublish: true,
    canManageMembers: false,
    canManageDevices: false,
  },
});

const PREVIEW_STREAMS = [
  { streamId: "raw.preview.front", assetId: "preview", sensorId: "front", status: "offline", displayName: "전방 EO" },
  { streamId: "raw.preview.thermal", assetId: "preview", sensorId: "thermal", status: "offline", displayName: "열화상 fallback" },
  { streamId: "raw.preview.rear", assetId: "preview", sensorId: "rear", status: "offline", displayName: "AI 감지 overlay" },
] as const;

const PREVIEW_TELEMETRY = [{
  uuid: "raw.preview.rear",
  latitude: 35.8669,
  longitude: 128.5931,
  altitude: 18,
  velocity: 0,
  epochTime: "00:00:01",
}] as const;

declare global {
  interface Window {
    __GCS_SAKER_RENDER_DIAGNOSTICS__?: Record<string, { renderCount: number }>;
  }
}

test.beforeEach(async ({ page }) => {
  await mockOperationalPolling(page);
});

test("login mock flow reaches dashboard without real credentials", async ({ page }, testInfo) => {
  await mockLoginFlow(page);

  // Keep this browser contract deterministic: authentication is under test,
  // while live operational API polling is covered by the deployment smokes.
  await page.goto("/login?redirect=%2F%3FuiPreview%3D1");
  await page.getByLabel("아이디").fill("operator01");
  await page.getByLabel("비밀번호").fill("preview-password");
  await page.getByRole("button", { name: "접속" }).click();

  await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
  await attachScreenshot(page, testInfo, "login-dashboard");
});

test("dashboard preview supports stream, map, and operations navigation", async ({ page }, testInfo) => {
  await page.goto("/?uiPreview=1");

  await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "선택 스트림" })).toBeVisible();
  await expectRenderDiagnostics(page, ["DashboardPageController", "SelectedStreamPanel", "StreamGrid"]);
  await attachScreenshot(page, testInfo, "dashboard-preview");

  await page.getByRole("button", { name: "스트리밍 3 선택" }).click();
  await expect(page.getByRole("dialog", { name: "스트리밍 3 스트림 연결" })).toBeVisible();
  await page.getByRole("button", { name: "취소" }).click();
  await expect(page.getByText("스트리밍 3 focus 대기")).toBeVisible();
  await expect(page.getByRole("region", { name: "선택 스트림" })).toContainText("스트림 미선택");

  await page.getByRole("button", { name: "이벤트로그" }).click();
  await expect(page.getByRole("heading", { name: "이벤트 로그" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Mock ICE relay fallback 감지/ })).toBeVisible();
  await expectRenderDiagnostics(page, ["EventLogView"]);
  await attachScreenshot(page, testInfo, "event-log-preview");

  await page.getByRole("button", { name: "CCTV" }).click();
  await expect(page.getByRole("heading", { name: "통합 CCTV 월" })).toBeVisible();
  await page.getByRole("button", { name: "4x4" }).click();
  await expect(page.getByText(/16채널 감시 레이아웃/)).toBeVisible();

  await page.getByRole("button", { name: "대시보드" }).click();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
  await expectRenderDiagnostics(page, ["PublicVectorMap", "TacticalLeafletMap"]);
});

async function mockLoginFlow(page: Page): Promise<void> {
  await page.route("**/auth-policy/auth/refresh", (route) =>
    route.fulfill({ json: { detail: "preview refresh disabled" }, status: 401 }),
  );
  await page.route("**/auth-policy/auth/login", (route) =>
    route.fulfill({ json: PREVIEW_LOGIN_RESPONSE, status: 200 }),
  );
  await page.route("**/auth-policy/auth/logout", (route) =>
    route.fulfill({ body: "", status: 204 }),
  );
}

async function mockOperationalPolling(page: Page): Promise<void> {
  await page.route("**/media-control/api/v1/streams**", (route) =>
    route.fulfill({ json: PREVIEW_STREAMS, status: 200 }),
  );
  await page.route("**/api/telemetry/all**", (route) =>
    route.fulfill({ json: PREVIEW_TELEMETRY, status: 200 }),
  );
  await page.route("**/api/v1/groups**", (route) =>
    route.fulfill({ json: [], status: 200 }),
  );
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

async function expectRenderDiagnostics(page: Page, labels: string[]) {
  await page.waitForFunction((expectedLabels) => {
    const diagnostics = window.__GCS_SAKER_RENDER_DIAGNOSTICS__ ?? {};
    return expectedLabels.every((label) => diagnostics[label]?.renderCount > 0);
  }, labels);
}
