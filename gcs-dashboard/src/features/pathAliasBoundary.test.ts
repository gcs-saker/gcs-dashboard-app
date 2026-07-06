import { describe, expect, test } from "vitest";

const PARENT_IMPORT_PATTERN = /(?:from\s+|import\(\s*)["']\.\.\//;
const FEATURE_SOURCE_MODULES = import.meta.glob("./**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

describe("path alias boundary", () => {
  test("keeps feature imports from climbing parent directories", () => {
    const offenders = Object.entries(FEATURE_SOURCE_MODULES)
      .filter(([, source]) => PARENT_IMPORT_PATTERN.test(source))
      .map(([file]) => file.replace("./", ""));

    expect(offenders).toEqual([]);
  });
});
