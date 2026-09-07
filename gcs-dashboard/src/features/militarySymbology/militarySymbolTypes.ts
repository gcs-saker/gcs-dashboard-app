export const MILITARY_SYMBOL_STANDARD = "MIL-STD-2525E-C1" as const;

export type MilitaryAffiliation = "FRIENDLY" | "HOSTILE" | "NEUTRAL" | "UNKNOWN";
export type MilitarySymbolStatus = "PRESENT" | "PLANNED";
export type MilitaryEntityType =
  | "UAV_FIXED_WING"
  | "UAV_ROTARY_WING"
  | "UGV"
  | "EO_IR_SENSOR"
  | "GCS"
  | "WAYPOINT";

export interface MilitarySymbolModifiers {
  uniqueDesignation?: string;
  callSign?: string;
  headingDeg?: number;
  speedMps?: number;
  altitudeM?: number;
  observedAt?: string;
}

export interface MilitarySymbol {
  symbolId: string;
  standard: typeof MILITARY_SYMBOL_STANDARD;
  sidc: string;
  affiliation: MilitaryAffiliation;
  status: MilitarySymbolStatus;
  entityType: MilitaryEntityType;
  source: "SERVER_POLICY";
  modifiers?: MilitarySymbolModifiers;
}

