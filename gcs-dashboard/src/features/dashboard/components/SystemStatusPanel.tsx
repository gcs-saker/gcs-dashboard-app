import { type ReactNode } from "react";
import { DASHBOARD_QUERY_POLICY } from "@/features/queryClient";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import { useSystemStatusModel } from "@dashboard/hooks/operations/useSystemStatusModel";
import { SystemImpactPanel } from "./system-status/SystemImpactPanel";
import { SystemRttPanel } from "./system-status/SystemRttPanel";
import { SystemRunbookPanel } from "./system-status/SystemRunbookPanel";
import { SystemServiceCards } from "./system-status/SystemServiceCards";
import { SystemStatePreview } from "./system-status/SystemStatePreview";
import { SystemStatusAlert, SystemStatusPageHero } from "./system-status/SystemStatusPageHero";
import { SystemStatusPrimaryPanel } from "./system-status/SystemStatusPrimaryPanel";

interface SystemStatusPanelProps {
  controls?: ReactNode;
  fetcher?: typeof fetch;
  onAuthFailure?: () => void;
  refreshMs?: number;
  variant?: "panel" | "page";
}

export function SystemStatusPanel({ controls, fetcher, onAuthFailure, refreshMs = DASHBOARD_QUERY_POLICY.realtimeRefetchMs, variant = "panel" }: SystemStatusPanelProps) {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.systemStatusPanel);
  const { status, viewModel } = useSystemStatusModel({ fetcher, onAuthFailure, refreshMs });

  if (variant === "panel") {
    return <SystemStatusPrimaryPanel checkedText={viewModel.checkedText} controls={controls} rows={viewModel.primaryRows} variant={variant} />;
  }

  return (
    <div className="system-status-page">
      <SystemStatusPageHero readinessText={viewModel.readinessText} status={status} />
      <SystemStatePreview />
      <SystemStatusAlert status={status} />
      <SystemServiceCards serviceCards={viewModel.serviceCards} />
      <SystemRttPanel
        latestRttText={viewModel.latestRttText}
        rttChart={viewModel.rttChart}
        rttMax={viewModel.rttMax}
        rttStats={viewModel.rttStats}
      />
      <SystemImpactPanel impactItems={viewModel.impactItems} status={status} />
      <SystemRunbookPanel checkedText={viewModel.checkedText} status={status} />
    </div>
  );
}
