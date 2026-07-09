import type { SignalingTimingRecorder } from "./whepPlaybackContracts";
import { reportWhepDebug } from "./whepPlaybackDebug";
import { SDP_OFFER_HEADERS } from "@streaming/streamingProtocolHeaders";

const WHEP_READY_RETRY_STATUS_CODES: ReadonlySet<number> = new Set([404, 409, 425, 503]);
const WHEP_READY_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const;
const WHEP_ABORTED_MESSAGE = "WebRTC playback was aborted";

export class WhepHttpError extends Error {
  constructor(readonly status: number) {
    super(`WHEP request failed with ${status}`);
  }
}

export async function postWhepOfferWithReadyRetry(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      return await postWhepOffer(whepUrl, offerSdp, fetcher, signal, recordTiming);
    } catch (error) {
      if (!shouldRetryWhepReadyError(error, attempt)) {
        throw error;
      }
      const delayMs = WHEP_READY_RETRY_DELAYS_MS[attempt];
      attempt += 1;
      reportWhepDebug("whep-ready-retry", whepUrl, { status: String((error as WhepHttpError).status), delayMs: String(delayMs) });
      await sleepUnlessAborted(delayMs, signal);
    }
  }
}

export function isRetryableWhepStatus(status: number): boolean {
  return WHEP_READY_RETRY_STATUS_CODES.has(status);
}

async function postWhepOffer(
  whepUrl: string,
  offerSdp: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  recordTiming: SignalingTimingRecorder,
): Promise<Response> {
  const response = await fetcher(whepUrl, {
    method: "POST",
    headers: SDP_OFFER_HEADERS,
    body: offerSdp,
    signal,
  });
  recordTiming("whepResponseMs");
  reportWhepDebug("whep-post-response", whepUrl, { status: String(response.status) });

  if (!response.ok) {
    throw new WhepHttpError(response.status);
  }

  return response;
}

function shouldRetryWhepReadyError(error: unknown, attempt: number): boolean {
  return (
    error instanceof WhepHttpError &&
    isRetryableWhepStatus(error.status) &&
    attempt < WHEP_READY_RETRY_DELAYS_MS.length
  );
}

function sleepUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(new Error(WHEP_ABORTED_MESSAGE));
  }
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", abort);
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(new Error(WHEP_ABORTED_MESSAGE));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
