import type { ControlIntent } from "@control/contracts/controlIntent";

export type ControlIntentSender = (intent: ControlIntent) => void;
