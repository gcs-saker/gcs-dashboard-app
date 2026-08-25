import { expect, test, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

test.beforeEach(async ({ page }) => {
  await mockEmptyOperationalState(page);
});

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} dashboard stays within the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?uiPreview=1");

    await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "대시보드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CCTV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "자산" })).toBeVisible();
    await expect(page.getByRole("region", { name: "선택 스트림" })).toBeVisible();
    await expect(page.getByRole("region", { name: "다중 스트림" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "자산" }).click();
    await expect(page.getByRole("complementary", { name: "자산트리" })).toBeVisible();
    await page.getByTitle("자산트리 닫기").click();
  });
}

async function mockEmptyOperationalState(page: Page): Promise<void> {
  await page.route("**/media-control/api/v1/streams**", (route) => route.fulfill({ json: [], status: 200 }));
  await page.route("**/api/telemetry/all**", (route) => route.fulfill({ json: [], status: 200 }));
  await page.route("**/api/v1/groups**", (route) => route.fulfill({ json: [], status: 200 }));
}
