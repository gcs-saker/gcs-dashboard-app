import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const denied = new DOMException("마이크 권한이 거부되었습니다.", "NotAllowedError");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        addEventListener: () => undefined,
        enumerateDevices: async () => [
          { deviceId: "camera-1", groupId: "group-1", kind: "videoinput", label: "Mobile camera", toJSON: () => ({}) },
          { deviceId: "mic-1", groupId: "group-1", kind: "audioinput", label: "Mobile microphone", toJSON: () => ({}) },
        ],
        getUserMedia: async () => Promise.reject(denied),
        removeEventListener: () => undefined,
      },
    });
  });
});

test("mobile publisher keeps a recoverable UI after permission and network transitions", async ({ page }) => {
  await page.goto("/?uiPreview=1&webcamPublisher=1");

  await expect(page.getByRole("main", { name: "Local webcam WebRTC test publisher" })).toBeVisible();
  await expect(page.getByRole("button", { name: "카메라 준비" })).toBeVisible();
  await page.getByRole("button", { name: "카메라 준비" }).click();

  await expect(page.getByText("마이크 권한이 거부되었습니다.")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("오류");

  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
  });

  await expect(page.getByText("마이크 권한이 거부되었습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "카메라 준비" })).toBeEnabled();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.reload();
  await expect(page.getByRole("status")).toContainText("대기");
  await expect(page.getByRole("button", { name: "카메라 준비" })).toBeEnabled();
  await expect(page.getByText("마이크 권한이 거부되었습니다.")).toHaveCount(0);
});
