import { describe, expect, test } from "vitest";
import { devProxyPolicy } from "./viteSecurityPolicy";

describe("Vite development security boundary", () => {
  test("uses TLS verification by default", () => {
    expect(devProxyPolicy("http://127.0.0.1:8080", {})).toEqual({ secure: true });
  });

  test("rejects an implicit production proxy", () => {
    expect(() => devProxyPolicy("https://gcs-saker.com", {})).toThrow("Production proxy requires");
  });

  test("allows production only through an explicit opt in", () => {
    expect(devProxyPolicy("https://gcs-saker.com", { VITE_ALLOW_PRODUCTION_PROXY: "true" })).toEqual({
      secure: true,
    });
  });

  test("limits insecure TLS to loopback local-test", () => {
    expect(() =>
      devProxyPolicy("https://example.internal", {
        VITE_DEV_ALLOW_INSECURE_TLS: "true",
        VITE_DEV_PROFILE: "local-test",
      }),
    ).toThrow("loopback local-test");
    expect(
      devProxyPolicy("https://127.0.0.1:8443", {
        VITE_DEV_ALLOW_INSECURE_TLS: "true",
        VITE_DEV_PROFILE: "local-test",
      }),
    ).toEqual({ secure: false });
  });
});
