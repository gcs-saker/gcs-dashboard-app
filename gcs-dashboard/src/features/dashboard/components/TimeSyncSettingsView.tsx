import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { canManageDeviceProvisioning } from "@auth/rolePermissions";
import { useTimeSyncStatus } from "@dashboard/hooks/useTimeSyncStatus";
import { calculateBrowserOffsetMs, type TimeSyncConfigInput } from "@dashboard/timeSync";
import type { MotionMode } from "@dashboard/motionPreference";
import { SETTINGS_TABS, type PolicySettingsTab, type SettingsTab } from "@dashboard/timeSyncSettingsContracts";
import { DeviceApprovalPanel } from "./settings/DeviceApprovalPanel";
import { MotionPolicyPanel } from "./settings/MotionPolicyPanel";
import { ProvisioningTokenPanel } from "./settings/ProvisioningTokenPanel";
import { SettingsPolicyPanel } from "./settings/SettingsPolicyPanel";
import { SettingsTabs } from "./settings/SettingsTabs";
import { SignupTokenPanel } from "./settings/SignupTokenPanel";
import { TimeSyncForm } from "./settings/TimeSyncForm";
import { TimeSyncHeader } from "./settings/TimeSyncHeader";
import { TimeSyncMetrics } from "./settings/TimeSyncMetrics";
import { GroupMemberPanel } from "./settings/GroupMemberPanel";

const DEFAULT_TIME_SYNC_FORM: TimeSyncConfigInput = {
  mode: "public",
  sourceHost: "pool.ntp.org",
  sourcePort: 123,
  driftWarnMs: 1_000,
};

interface TimeSyncSettingsViewProps {
  motionMode?: MotionMode;
  onMotionModeChange?: (mode: MotionMode) => void;
}

export function TimeSyncSettingsView({ motionMode = "full", onMotionModeChange }: TimeSyncSettingsViewProps = {}) {
  const { currentUser } = useAuth();
  const canManageDevices = currentUser?.capabilities.canManageDevices ?? canManageDeviceProvisioning(currentUser?.role);
  const { errorMessage, isLoading, isSaving, lastUpdatedAt, refresh, runCheck, save, status } = useTimeSyncStatus();
  const [form, setForm] = useState<TimeSyncConfigInput>(DEFAULT_TIME_SYNC_FORM);
  const [activeTab, setActiveTab] = useState<SettingsTab>("time");

  useEffect(() => {
    if (!canManageDevices && activeTab === "provisioning") {
      setActiveTab("time");
    }
  }, [activeTab, canManageDevices]);

  useEffect(() => {
    if (!status) return;
    setForm({
      mode: status.mode,
      sourceHost: status.sourceHost ?? "",
      sourcePort: status.sourcePort,
      driftWarnMs: status.driftWarnMs,
    });
  }, [status]);

  const browserOffsetMs = useMemo(() => (status ? calculateBrowserOffsetMs(status) : 0), [status]);
  const visibleTabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => canManageDevices || tab.id !== "provisioning").map((tab) => tab.id),
    [canManageDevices],
  );
  const saveCurrentForm = useCallback((): void => {
    void save(form);
  }, [form, save]);
  const refreshStatus = useCallback((): void => {
    void refresh();
  }, [refresh]);
  const runSyncCheck = useCallback((): void => {
    void runCheck();
  }, [runCheck]);

  return (
    <section className="time-sync-view" aria-label="시간 동기화 설정">
      <TimeSyncHeader status={status} />
      <SettingsTabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        visibleTabs={visibleTabs}
      />
      {activeTab === "time" ? (
        <>
          <TimeSyncMetrics browserOffsetMs={browserOffsetMs} lastUpdatedAt={lastUpdatedAt} status={status} />
          <TimeSyncForm
            form={form}
            isLoading={isLoading}
            isSaving={isSaving}
            onChangeForm={setForm}
            onRefresh={refreshStatus}
            onRunCheck={runSyncCheck}
            onSubmit={saveCurrentForm}
          />
        </>
      ) : activeTab === "motion" ? (
        <MotionPolicyPanel motionMode={motionMode} onMotionModeChange={onMotionModeChange} />
      ) : activeTab === "provisioning" && canManageDevices ? (
        <>
          <SignupTokenPanel />
          <ProvisioningTokenPanel />
          <DeviceApprovalPanel />
        </>
      ) : activeTab === "account" && canManageDevices ? (
        <GroupMemberPanel />
      ) : (
        <SettingsPolicyPanel tab={activeTab as PolicySettingsTab} />
      )}
      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}
