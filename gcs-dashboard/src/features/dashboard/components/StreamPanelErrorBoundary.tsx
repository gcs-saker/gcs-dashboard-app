import type { ReactNode } from "react";
import { DashboardErrorBoundary } from "@/features/ui/ErrorBoundary";

interface StreamPanelErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel: string;
}

export function StreamPanelErrorBoundary({ children, fallbackLabel }: StreamPanelErrorBoundaryProps) {
  return (
    <DashboardErrorBoundary
      boundaryId={`stream-card:${fallbackLabel}`}
      description="이 스트림 패널만 격리되었습니다. 다른 스트림과 지도, 이벤트 로그는 계속 사용할 수 있습니다."
      retryLabel="스트림 패널 다시 시도"
      scope="stream"
      title={fallbackLabel}
    >
      {children}
    </DashboardErrorBoundary>
  );
}
