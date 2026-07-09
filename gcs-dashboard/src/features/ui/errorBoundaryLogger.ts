import { ERROR_BOUNDARY_COPY, ERROR_BOUNDARY_EVENT_NAME, type ErrorBoundaryScope, type ErrorBoundaryTelemetry } from "./errorBoundaryContracts";

interface ReportBoundaryErrorInput {
  boundaryId: string;
  componentStack: string | null;
  error: unknown;
  scope: ErrorBoundaryScope;
  title: string;
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /(access[_-]?token|refresh[_-]?token|password|secret)=([^&\s]+)/gi,
  /https?:\/\/[^\s]+/gi,
];

export function reportErrorBoundaryError(input: ReportBoundaryErrorInput): ErrorBoundaryTelemetry {
  const telemetry: ErrorBoundaryTelemetry = {
    boundaryId: input.boundaryId,
    componentStack: input.componentStack,
    message: sanitizeErrorMessage(input.error),
    scope: input.scope,
    timestamp: new Date().toISOString(),
    title: input.title,
  };

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ERROR_BOUNDARY_EVENT_NAME, { detail: telemetry }));
  }

  if (import.meta.env.DEV) {
    console.error(ERROR_BOUNDARY_COPY.eventMessage, telemetry);
  }

  return telemetry;
}

export function sanitizeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error || "unknown error");
  return SECRET_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "[redacted]"),
    rawMessage,
  ).slice(0, 160);
}
