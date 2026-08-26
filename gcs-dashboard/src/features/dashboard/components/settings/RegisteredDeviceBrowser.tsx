import { useState, type FormEvent } from "react";
import type { RegisteredDevice } from "@dashboard/devices/adminDevices";

const PAGE_SIZE = 5;

export function RegisteredDeviceBrowser({ devices, mutatingDeviceUuid, onRename }: {
  devices: RegisteredDevice[]; mutatingDeviceUuid: string | null;
  onRename: (deviceUuid: string, displayName: string) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [selectedUuid, setSelectedUuid] = useState("");
  const pageCount = Math.max(1, Math.ceil(devices.length / PAGE_SIZE));
  const visible = devices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = visible.find((device) => device.deviceUuid === selectedUuid) ?? visible[0];
  if (!selected) return <p>등록된 장비가 없습니다.</p>;
  return <div className="settings-paged-list">
    <div className="settings-listbox" role="listbox" aria-label="등록 장비 목록">
      {visible.map((device) => <button aria-selected={device.deviceUuid === selected.deviceUuid}
        key={device.deviceUuid} onClick={() => setSelectedUuid(device.deviceUuid)} role="option" type="button">
        <strong>{device.displayName}</strong><span>{device.groupId} · {device.deviceType} · {device.status}</span>
      </button>)}
    </div>
    <RegisteredDeviceAliasCard device={selected} isMutating={mutatingDeviceUuid === selected.deviceUuid}
      key={selected.deviceUuid} onRename={onRename} />
    <nav className="settings-pagination" aria-label="등록 장비 페이지">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">이전</button>
      <span>{page + 1} / {pageCount}</span>
      <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} type="button">다음</button>
    </nav>
  </div>;
}

function RegisteredDeviceAliasCard({ device, isMutating, onRename }: {
  device: RegisteredDevice; isMutating: boolean;
  onRename: (deviceUuid: string, displayName: string) => Promise<void>;
}) {
  const [alias, setAlias] = useState(device.displayName);
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const nextAlias = alias.trim();
    if (nextAlias && nextAlias !== device.displayName) void onRename(device.deviceUuid, nextAlias);
  };
  return <article className="device-approval-panel__card device-alias-card">
    <div className="device-approval-panel__identity">
      <span>{device.groupId} · {device.deviceType} · {device.status}</span><strong>{device.displayName}</strong>
    </div>
    <form className="device-approval-panel__actions device-alias-card__form" onSubmit={submit}>
      <label><span>장비 별칭</span><input aria-label={`${device.displayName} 장비 별칭`} maxLength={128}
        onChange={(event) => setAlias(event.target.value)} value={alias} /></label>
      <button disabled={isMutating || !alias.trim() || alias.trim() === device.displayName} type="submit">
        {isMutating ? "저장 중" : "별칭 저장"}
      </button>
    </form>
  </article>;
}
