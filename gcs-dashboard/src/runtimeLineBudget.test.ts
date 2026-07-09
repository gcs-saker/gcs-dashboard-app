import { describe, expect, test } from "vitest";

const RUNTIME_FILE_LINE_LIMIT = 150;
const runtimeSources = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});

function isRuntimeSource(path: string): boolean {
  return !path.endsWith(".test.ts")
    && !path.endsWith(".test.tsx")
    && !path.includes("/test-results/")
    && !path.endsWith("/setupTests.ts");
}

function countLines(source: unknown): number {
  return String(source).split(/\r?\n/).length;
}

describe("runtime file line budget", () => {
  test("keeps runtime TypeScript files small enough to review", () => {
    const oversizedFiles = Object.entries(runtimeSources)
      .filter(([path]) => isRuntimeSource(path))
      .map(([path, source]) => ({ lineCount: countLines(source), path }))
      .filter((file) => file.lineCount > RUNTIME_FILE_LINE_LIMIT);

    expect(oversizedFiles).toEqual([]);
  });
});
