import { useMemo, useState } from "react";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { StreamDeviceOption } from "@dashboard/assets/streamDevices";

interface StreamDeviceConnectDialogProps {
  devices: StreamDeviceOption[];
  stream: DashboardStreamSlot;
  onCancel: () => void;
  onConnect: (device: StreamDeviceOption) => void;
  onDisconnect: () => void;
}

export function StreamDeviceConnectDialog({
  devices,
  stream,
  onCancel,
  onConnect,
  onDisconnect,
}: StreamDeviceConnectDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const availableStreams = useMemo(() => devices.filter((device) => device.status === "online"), [devices]);

  const connectStream = (device: StreamDeviceOption): void => {
    const trimmedDisplayName = displayName.trim();
    onConnect(trimmedDisplayName ? { ...device, name: trimmedDisplayName } : device);
  };

  return (
    <div className="widget-dialog__backdrop">
      <section
        aria-label={`${stream.title} 스트림 연결`}
        aria-modal="true"
        className="widget-dialog stream-connect-dialog"
        role="dialog"
      >
        <header className="widget-dialog__header">
          <h2>{stream.title} 스트림 연결</h2>
          <button className="widget-icon-button" onClick={onCancel} title="닫기" type="button">X</button>
        </header>

        <div className="widget-dialog__list">
          <div className="stream-connect-dialog__manual">
            <label className="stream-connect-dialog__name-field">
              <span>표시 이름 (선택)</span>
              <input
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="선택한 스트림의 표시 이름"
                value={displayName}
              />
            </label>
          </div>
          <AvailableStreamList devices={availableStreams} onConnect={connectStream} />
        </div>

        <footer className="widget-dialog__footer">
          <button className="ops-command-button" onClick={onDisconnect} type="button">스트림 연결 해제</button>
          <span />
          <button className="ops-command-button" onClick={onCancel} type="button">취소</button>
        </footer>
      </section>
    </div>
  );
}

function AvailableStreamList({ devices, onConnect }: {
  devices: StreamDeviceOption[];
  onConnect: (device: StreamDeviceOption) => void;
}) {
  return <>
    <div className="stream-connect-dialog__section-title">
      <span>현재 수신 가능한 스트림</span><strong>{devices.length}개</strong>
    </div>
    {devices.length === 0 ? <p className="stream-connect-dialog__empty">현재 들어오고 있는 스트림이 없습니다.</p> : null}
    {devices.map((device) => (
      <button className="widget-dialog__item stream-connect-dialog__device" key={device.id}
        onClick={() => onConnect(device)} type="button">
        <span><strong>{device.name}</strong><small>{device.mediaType.toUpperCase()} · 수신 가능</small></span>
        <span className="ops-badge is-online">수신 중</span>
      </button>
    ))}
  </>;
}
