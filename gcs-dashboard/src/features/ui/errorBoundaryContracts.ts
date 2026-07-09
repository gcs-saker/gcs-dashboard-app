export const ERROR_BOUNDARY_EVENT_NAME = "gcs:error-boundary";

export const ERROR_BOUNDARY_COPY = Object.freeze({
  badge: "격리됨",
  defaultDescription: "이 영역에서만 오류가 발생했습니다. 다른 패널은 계속 사용할 수 있습니다.",
  defaultRetryLabel: "다시 시도",
  eventMessage: "UI boundary isolated a rendering failure.",
} as const);

export type ErrorBoundaryScope = "route" | "panel" | "stream";

export interface ErrorBoundaryTelemetry {
  boundaryId: string;
  componentStack: string | null;
  message: string;
  scope: ErrorBoundaryScope;
  timestamp: string;
  title: string;
}
