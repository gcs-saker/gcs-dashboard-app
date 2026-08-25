import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { canManageDeviceProvisioning } from "@auth/rolePermissions";
import { useTimeSyncStatus } from "@dashboard/hooks/operations/useTimeSyncStatus";
import { calculateBrowserOffsetMs, type TimeSyncConfigInput } from "@dashboard/operations/timeSync";
import type { MotionMode } from "@dashboard/preferences/motionPreference";
import { SETTINGS_TABS, type PolicySettingsTab, type SettingsTab } from "@dashboard/operations/timeSyncSettingsContracts";
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
import { GroupLifecyclePanel } from "./settings/GroupLifecyclePanel";

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
  const canManageDevices = currentUser?.capabilities?.canManageDevices ?? canManageDeviceProvisioning(currentUser?.role);
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
      <TimeSyncHeader browserOffsetMs={browserOffsetMs} status={status} />
      <SettingsTabs
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        visibleTabs={visibleTabs}
      />
      <SettingsTabContent {...{ activeTab, browserOffsetMs, canManageDevices, currentUser, form, isLoading,
        isSaving, lastUpdatedAt, motionMode, onMotionModeChange, refreshStatus, runSyncCheck,
        saveCurrentForm, setForm, status }} />
      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
    </section>
  );
}

function SettingsTabContent(props: {
  activeTab: SettingsTab;
  browserOffsetMs: number;
  canManageDevices: boolean;
  currentUser: ReturnType<typeof useAuth>["currentUser"];
  form: TimeSyncConfigInput;
  isLoading: boolean;
  isSaving: boolean;
  lastUpdatedAt: number | null;
  motionMode: MotionMode;
  onMotionModeChange?: (mode: MotionMode) => void;
  refreshStatus: () => void;
  runSyncCheck: () => void;
  saveCurrentForm: () => void;
  setForm: (form: TimeSyncConfigInput) => void;
  status: ReturnType<typeof useTimeSyncStatus>["status"];
}) {
  return props.activeTab === "time" ? (
        <>
          <TimeSyncMetrics browserOffsetMs={props.browserOffsetMs} lastUpdatedAt={props.lastUpdatedAt} status={props.status} />
          <TimeSyncForm
            form={props.form} isLoading={props.isLoading} isSaving={props.isSaving}
            onChangeForm={props.setForm} onRefresh={props.refreshStatus}
            onRunCheck={props.runSyncCheck} onSubmit={props.saveCurrentForm}
          />
        </>
      ) : props.activeTab === "motion" ? (
        <MotionPolicyPanel motionMode={props.motionMode} onMotionModeChange={props.onMotionModeChange} />
      ) : props.activeTab === "provisioning" && props.canManageDevices ? (
        <>
          <SignupTokenPanel />
          <ProvisioningTokenPanel />
          <DeviceApprovalPanel />
        </>
      ) : props.activeTab === "account" && props.canManageDevices ? (
        <>
          {props.currentUser?.role === "admin" ? <GroupLifecyclePanel /> : null}
          <GroupMemberPanel />
        </>
      ) : (
        <SettingsPolicyPanel tab={props.activeTab as PolicySettingsTab} />
      );
}
