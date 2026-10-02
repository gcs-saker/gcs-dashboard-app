export type TalkbackReceiptState =
  | "receiver_connected"
  | "audio_playing"
  | "muted"
  | "playback_blocked"
  | "failed"
  | "ended";

export interface TalkbackReceipt {
  schemaVersion: "gcs-saker.talkback-receipt.v1";
  streamId: string;
  state: TalkbackReceiptState;
  occurredAt: string;
  reasonCode?: string;
}

export function createTalkbackReceipt(
  streamId: string,
  state: TalkbackReceiptState,
  reasonCode?: string,
  now: Date = new Date(),
): TalkbackReceipt {
  const receipt: TalkbackReceipt = {
    schemaVersion: "gcs-saker.talkback-receipt.v1",
    streamId,
    state,
    occurredAt: now.toISOString(),
  };
  if (reasonCode) receipt.reasonCode = reasonCode;
  return receipt;
}

export function receiptStateForPlayback(
  enabled: boolean,
  audioState: string | null | undefined,
  errorMessage: string | null,
): TalkbackReceiptState {
  if (!enabled) return "ended";
  if (errorMessage) return "failed";
  if (audioState === "receiving") return "audio_playing";
  if (audioState === "track-muted") return "muted";
  if (audioState === "playback-blocked") return "playback_blocked";
  return "receiver_connected";
}
