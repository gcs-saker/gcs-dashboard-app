import { describe, expect, test } from "vitest";

import { renderMilitarySymbolSvg } from "./militarySymbolRenderer";
import type { MilitarySymbol } from "./militarySymbolTypes";
import { validateMilitarySymbol } from "./militarySymbolValidation";

const symbol: MilitarySymbol = {
  symbolId: "asset-1",
  standard: "MIL-STD-2525E-C1",
  sidc: "10030100001101000000",
  affiliation: "FRIENDLY",
  status: "PRESENT",
  entityType: "UAV_ROTARY_WING",
  source: "SERVER_POLICY",
  modifiers: { headingDeg: 90 },
};

describe("militarySymbolRenderer", () => {
  test("renders affiliation frame entity glyph and independent heading line", () => {
    const svg = renderMilitarySymbolSvg(symbol);

    expect(svg).toContain('stroke="#4aa8ff"');
    expect(svg).toContain("M17 24h30");
    expect(svg).toContain("M32 32L57.00 32.00");
  });

  test("uses a dashed frame for planned status", () => {
    expect(renderMilitarySymbolSvg({ ...symbol, status: "PLANNED" })).toContain('stroke-dasharray="5 3"');
  });

  test("renders distinct hostile neutral and unknown frames without relying on color alone", () => {
    expect(renderMilitarySymbolSvg({ ...symbol, affiliation: "HOSTILE" })).toContain("M32 5 59 32");
    expect(renderMilitarySymbolSvg({ ...symbol, affiliation: "NEUTRAL" })).toContain('<rect x="8"');
    expect(renderMilitarySymbolSvg({ ...symbol, affiliation: "UNKNOWN" })).toContain("Q12 8 26 8");
  });

  test("fails closed for malformed SIDC and untrusted source", () => {
    expect(validateMilitarySymbol({ ...symbol, sidc: "legacy-15-char" })).toEqual({
      valid: false,
      errors: ["invalid-sidc"],
    });
    expect(renderMilitarySymbolSvg({ ...symbol, sidc: "bad" })).toContain("invalid military symbol");
  });
});

