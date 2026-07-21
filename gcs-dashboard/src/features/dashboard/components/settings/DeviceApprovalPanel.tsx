import { useAuth } from "@/features/auth/AuthProvider";
import { useAdminDevices } from "@dashboard/hooks/useAdminDevices";
import type { RegisteredDevice } from "@dashboard/adminDevices";

export function DeviceApprovalPanel() {
  const { currentUser } = useAuth();
  const { activate, disable, errorMessage, isLoading, mutatingDeviceUuid, pendingDevices, refresh } = useAdminDevices();
  const isAdmin = currentUser?.role === "admin";

  return (
    <section className="time-sync-view__policy device-approval-panel" aria-label="승인 대기 장비">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div>
          <span>관리자 승인</span>
          <strong>승인 대기 장비 {pendingDevices.length}대</strong>
        </div>
        <button type="button" onClick={() => void refresh()}>
          새로고침
        </button>
      </header>

      <p className="device-approval-panel__hint">
        장비는 provisioning token으로 최초 등록된 뒤 pending 상태로 대기합니다. 관리자가 승인해야 송출 권한이 열립니다.
      </p>
      {!isAdmin ? <p className="provisioning-token-panel__notice">관리자 계정으로 로그인해야 장비를 승인할 수 있습니다.</p> : null}
      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
      <div className="device-approval-panel__list">
        {isLoading ? <p>승인 대기 장비를 불러오는 중</p> : null}
        {!isLoading && pendingDevices.length === 0 ? <p>승인 대기중인 장비가 없습니다.</p> : null}
        {pendingDevices.map((device) => (
          <PendingDeviceCard
            key={device.deviceUuid}
            device={device}
            isAdmin={isAdmin}
            isMutating={mutatingDeviceUuid === device.deviceUuid}
            onActivate={activate}
            onDisable={disable}
          />
        ))}
      </div>
    </section>
  );
}

interface PendingDeviceCardProps {
  device: RegisteredDevice;
  isAdmin: boolean;
  isMutating: boolean;
  onActivate: (deviceUuid: string) => Promise<void>;
  onDisable: (deviceUuid: string) => Promise<void>;
}

function PendingDeviceCard({
  device,
  isAdmin,
  isMutating,
  onActivate,
  onDisable,
}: PendingDeviceCardProps) {
  return (
    <article className="device-approval-panel__card">
      <div>
        <span>{device.groupId} · {device.deviceType}</span>
        <strong>{device.displayName}</strong>
        <small>{device.deviceUuid}</small>
      </div>
      <dl>
        <div>
          <dt>센서</dt>
          <dd>{device.sensors.length}개</dd>
        </div>
        <div>
          <dt>송출 경로</dt>
          <dd>{device.streamPaths.length}개</dd>
        </div>
      </dl>
      <div className="device-approval-panel__actions">
        <button disabled={!isAdmin || isMutating} onClick={() => void onActivate(device.deviceUuid)} type="button">
          {isMutating ? "처리 중" : "승인"}
        </button>
        <button disabled={!isAdmin || isMutating} onClick={() => void onDisable(device.deviceUuid)} type="button">
          거절
        </button>
      </div>
    </article>
  );
}
