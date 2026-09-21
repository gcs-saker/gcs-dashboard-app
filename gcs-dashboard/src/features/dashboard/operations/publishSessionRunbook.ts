export interface PublishSessionRunbookGuidance {
  action: string;
  caution: string;
  documentPath: string;
  id: string;
}

const DOCUMENT_PATH = "docs/operations/GCS-Saker_v1_Delivery_Operations_Manual.md";

export function publishSessionRunbook(reason?: string | null): PublishSessionRunbookGuidance | null {
  switch (reason) {
    case "store_unavailable":
      return guidance("RUN-PUB-01", "Redis health와 media-control 연결을 확인하고 자동 복구를 기다립니다.", "세션 키를 수동 삭제하지 마세요.");
    case "scan_truncated":
      return guidance("RUN-PUB-02", "세션 증가 원인과 만료 추세를 확인하고 별도 점검 창을 확보합니다.", "운영 중 전체 키 조회나 일괄 삭제를 실행하지 마세요.");
    case "session_age_exceeded":
      return guidance("RUN-PUB-03", "가장 오래된 세션과 Redis TTL을 확인해 만료 실패 원인을 조사합니다.", "활성 송출 확인 없이 세션을 종료하지 마세요.");
    default:
      return null;
  }
}

function guidance(id: string, action: string, caution: string): PublishSessionRunbookGuidance {
  return { action, caution, documentPath: DOCUMENT_PATH, id };
}

export type AlertAcknowledgementState = "acknowledged" | "in_progress" | "resolved";

export async function acknowledgePublishSessionAlert(
  runbookId: string,
  state: AlertAcknowledgementState,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await authenticatedFetch(apiV1Url("/operations/alerts/acknowledgements"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runbookId, state }),
  }, fetcher);
  if (!response.ok) throw new Error(`Alert acknowledgement failed with ${response.status}`);
}

interface AlertAcknowledgementResponse {
  runbookId: string;
  state: AlertAcknowledgementState;
}

export async function fetchPublishSessionAcknowledgements(fetcher: typeof fetch = fetch): Promise<Map<string, AlertAcknowledgementState>> {
  const response = await authenticatedFetch(apiV1Url("/operations/alerts/acknowledgements"), {
    headers: { Accept: "application/json" },
  }, fetcher);
  if (!response.ok) throw new Error(`Alert acknowledgement query failed with ${response.status}`);
  const payload = await response.json() as AlertAcknowledgementResponse[];
  return new Map(payload.map((item) => [item.runbookId, item.state]));
}
import { apiV1Url } from "@/config";
import { authenticatedFetch } from "@auth/authApi";
