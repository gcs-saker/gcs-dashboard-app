import type { MilitaryAffiliation, MilitaryEntityType, MilitarySymbol } from "./militarySymbolTypes";
import { validateMilitarySymbol } from "./militarySymbolValidation";

const COLORS: Record<MilitaryAffiliation, string> = {
  FRIENDLY: "#4aa8ff",
  HOSTILE: "#ff5151",
  NEUTRAL: "#4bd37b",
  UNKNOWN: "#ffd24a",
};

export function renderMilitarySymbolSvg(symbol: MilitarySymbol): string {
  const validation = validateMilitarySymbol(symbol);
  if (!validation.valid) return invalidSymbolSvg();
  const color = COLORS[symbol.affiliation];
  const dash = symbol.status === "PLANNED" ? ' stroke-dasharray="5 3"' : "";
  const heading = headingLine(symbol.modifiers?.headingDeg, color);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${symbol.entityType}">` +
    `<g fill="none" stroke="${color}" stroke-width="3"${dash}>${frame(symbol.affiliation)}${entity(symbol.entityType)}${heading}</g></svg>`;
}

function frame(affiliation: MilitaryAffiliation): string {
  if (affiliation === "HOSTILE") return '<path d="M32 5 59 32 32 59 5 32Z"/>';
  if (affiliation === "NEUTRAL") return '<rect x="8" y="8" width="48" height="48"/>';
  if (affiliation === "UNKNOWN") return '<path d="M12 22Q12 8 26 8h12q14 0 14 14v20q0 14-14 14H26Q12 56 12 42Z"/>';
  return '<path d="M7 56V22Q7 8 21 8h22q14 0 14 14v34Z"/>';
}

function entity(type: MilitaryEntityType): string {
  const paths: Record<MilitaryEntityType, string> = {
    UAV_FIXED_WING: '<path d="M15 33h12l5-12 5 12h12l-12 6-5 10-5-10Z"/>',
    UAV_ROTARY_WING: '<path d="M17 24h30M32 24v20M23 35h18M26 44h12"/>',
    UGV: '<rect x="20" y="27" width="24" height="16"/><circle cx="24" cy="47" r="3"/><circle cx="40" cy="47" r="3"/>',
    EO_IR_SENSOR: '<circle cx="32" cy="34" r="11"/><circle cx="32" cy="34" r="4"/><path d="M18 34H12M52 34h-6"/>',
    GCS: '<path d="M20 43h24M24 43l3-18h10l3 18M18 25h28"/>',
    WAYPOINT: '<circle cx="32" cy="32" r="9"/><path d="M32 17v6M32 41v6M17 32h6M41 32h6"/>',
  };
  return paths[type];
}

function headingLine(headingDeg: number | undefined, color: string): string {
  if (headingDeg === undefined) return "";
  const radians = (headingDeg - 90) * Math.PI / 180;
  const x = 32 + Math.cos(radians) * 25;
  const y = 32 + Math.sin(radians) * 25;
  return `<path stroke="${color}" d="M32 32L${x.toFixed(2)} ${y.toFixed(2)}"/>`;
}

function invalidSymbolSvg(): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="invalid military symbol"><rect x="8" y="8" width="48" height="48" fill="none" stroke="#9aa8b2" stroke-width="2"/><path d="M18 18 46 46M46 18 18 46" stroke="#9aa8b2" stroke-width="2"/></svg>';
}

