import type { MilitarySymbol } from "./militarySymbolTypes";
import { MILITARY_SYMBOL_STANDARD } from "./militarySymbolTypes";

const SIDC_PATTERN = /^[0-9]{20}$/;

export interface MilitarySymbolValidation {
  valid: boolean;
  errors: string[];
}

export function validateMilitarySymbol(symbol: MilitarySymbol): MilitarySymbolValidation {
  const errors: string[] = [];
  if (symbol.standard !== MILITARY_SYMBOL_STANDARD) errors.push("unsupported-standard");
  if (!SIDC_PATTERN.test(symbol.sidc)) errors.push("invalid-sidc");
  if (!symbol.symbolId.trim()) errors.push("missing-symbol-id");
  if (symbol.source !== "SERVER_POLICY") errors.push("untrusted-symbol-source");
  const heading = symbol.modifiers?.headingDeg;
  if (heading !== undefined && (!Number.isFinite(heading) || heading < 0 || heading >= 360)) {
    errors.push("invalid-heading");
  }
  return { valid: errors.length === 0, errors };
}

