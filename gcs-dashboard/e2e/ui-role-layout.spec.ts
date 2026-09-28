import { expect, test, type Locator, type Page } from "@playwright/test";

const OPERATOR = account("operator", {
  canControl: true,
  canManage: false,
  canManageDevices: false,
  canManageMembers: false,
  canPublish: true,
  canSendTalkback: true,
  canView: true,
});
const ADMIN = account("admin", {
  canControl: false,
  canManage: true,
  canManageDevices: true,
  canManageMembers: true,
  canPublish: false,
  canSendTalkback: false,
  canView: true,
});

test("mobile operator panels stay inside the viewport across navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAuthenticatedApp(page, OPERATOR);
  await login(page, "operator");

  const main = page.getByRole("main", { name: "Field Ops Dashboard" });
  await expect(main).toBeVisible();
  await expectInsideViewport(page, main);
  await expectInsideViewport(page, page.getByRole("region", { name: "선택 스트림" }));

  await page.getByRole("button", { name: "CCTV" }).click();
  await expect(page.getByRole("heading", { name: "통합 CCTV 월" })).toBeVisible();
  await expectInsideViewport(page, page.getByRole("main", { name: "Field Ops Dashboard" }));

  await page.getByRole("button", { name: "운영설정" }).click();
  await expect(page.getByRole("heading", { name: "운영설정" })).toBeVisible();
  await expectInsideViewport(page, page.getByRole("main", { name: "Field Ops Dashboard" }));
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

test("system administrator browser session never exposes media operations", async ({ page }) => {
  await mockAuthenticatedApp(page, ADMIN);
  await login(page, "admin");

  await expect(page.getByRole("button", { name: "이벤트로그" })).toBeVisible();
  await expect(page.getByRole("button", { name: "운영설정" })).toBeVisible();
  await expect(page.getByRole("button", { name: "대시보드" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "CCTV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "자산" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "마이크 송신" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "다중 stream 음성 송신" })).toHaveCount(0);
});

test("operator dashboard degrades to usable offline cards when operational APIs fail", async ({ page }) => {
  await mockAuthenticatedApp(page, OPERATOR, 503);
  await login(page, "operator");

  await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
  await expect(page.getByRole("button", { name: "스트리밍 1 선택" })).toBeVisible();
  await expect(page.getByText("오프라인").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "서버상태" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("responsive breakpoint boundary values never create horizontal overflow", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await mockAuthenticatedApp(page, OPERATOR);
  await login(page, "operator");
  const widths = [320, 359, 360, 759, 760, 761, 1319, 1320, 1321, 1499, 1500, 1501, 1920];

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("main", { name: "Field Ops Dashboard" })).toBeVisible();
    expect(await horizontalOverflow(page), `viewport ${width}px`).toBeLessThanOrEqual(1);
    await expectInsideViewport(page, page.getByRole("region", { name: "선택 스트림" }));
  }
});

async function login(page: Page, username: string): Promise<void> {
  await page.goto("/login?redirect=%2F");
  await page.getByLabel("아이디").fill(username);
  await page.getByLabel("비밀번호").fill("preview-password");
  await page.getByLabel("비밀번호").press("Enter");
}

async function mockAuthenticatedApp(page: Page, loginResponse: object, operationalStatus = 200): Promise<void> {
  await page.route("**/auth-policy/auth/refresh", (route) =>
    route.fulfill({ json: { detail: "no preview refresh" }, status: 401 }),
  );
  await page.route("**/auth-policy/auth/login", (route) => route.fulfill({ json: loginResponse, status: 200 }));
  await page.route("**/media-control/api/v1/streams**", (route) =>
    route.fulfill({ json: operationalStatus === 200 ? [] : { detail: "unavailable" }, status: operationalStatus }),
  );
  await page.route("**/api/telemetry/all**", (route) =>
    route.fulfill({ json: operationalStatus === 200 ? [] : { detail: "unavailable" }, status: operationalStatus }),
  );
  await page.route("**/api/v1/map/config**", (route) =>
    route.fulfill({ json: { provider: "none", styleUrl: "", attribution: "", requiresApiKey: false }, status: 200 }),
  );
  await page.route(/\/auth-policy\/api\/v1\/groups(?:[/?].*)?$/, (route) =>
    route.fulfill({ json: [], status: operationalStatus }),
  );
}

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

function account(role: "admin" | "operator", capabilities: Record<string, boolean>) {
  return {
    access_token: `${role}-browser-token`,
    capabilities,
    expires_in_minutes: 30,
    group_id: role === "admin" ? "root" : "co-a",
    role,
    securityVersion: 1,
    token_type: "bearer",
    username: `${role}01`,
  };
}
