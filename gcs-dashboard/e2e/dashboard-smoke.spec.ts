import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __GCS_SAKER_RENDER_DIAGNOSTICS__?: Record<string, { renderCount: number }>;
  }
}

test("dashboard preview supports stream and operations navigation", async ({ page }) => {
  await page.goto("/?uiPreview=1");

  await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "선택 스트림" })).toBeVisible();
  await expectRenderDiagnostics(page, ["DashboardPageController", "SelectedStreamPanel", "StreamGrid"]);

  await page.getByRole("button", { name: "이벤트로그" }).click();
  await expect(page.getByRole("heading", { name: "이벤트 로그" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Mock ICE relay fallback 감지/ })).toBeVisible();
  await expectRenderDiagnostics(page, ["EventLogView"]);

  await page.getByRole("button", { name: "CCTV" }).click();
  await expect(page.getByRole("heading", { name: "통합 CCTV 월" })).toBeVisible();
  await page.getByRole("button", { name: "4x4" }).click();
  await expect(page.getByText(/16채널 감시 레이아웃/)).toBeVisible();

  await page.getByRole("button", { name: "대시보드" }).click();
  await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
  await expectRenderDiagnostics(page, ["PublicVectorMap", "TacticalLeafletMap"]);
});

async function expectRenderDiagnostics(page: Page, labels: string[]) {
  await page.waitForFunction((expectedLabels) => {
    const diagnostics = window.__GCS_SAKER_RENDER_DIAGNOSTICS__ ?? {};
    return expectedLabels.every((label) => diagnostics[label]?.renderCount > 0);
  }, labels);
}
