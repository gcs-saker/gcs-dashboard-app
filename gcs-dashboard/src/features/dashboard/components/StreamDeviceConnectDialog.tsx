import { useState } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import type { StreamDeviceOption } from "../streamDevices";

interface StreamDeviceConnectDialogProps {
  devices: StreamDeviceOption[];
  stream: DashboardStreamSlot;
  onCancel: () => void;
  onConnect: (device: StreamDeviceOption) => void;
  onConnectAddress: (address: string, displayName: string) => void;
  onDisconnect: () => void;
}

export function StreamDeviceConnectDialog({
  devices,
  stream,
  onCancel,
  onConnect,
  onConnectAddress,
  onDisconnect,
}: StreamDeviceConnectDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const [streamAddress, setStreamAddress] = useState(stream.sourceUrl ?? stream.streamPath ?? "");
  const [addressError, setAddressError] = useState<string | null>(null);
  const connectWithDisplayName = (device: StreamDeviceOption): void => {
    const trimmedDisplayName = displayName.trim();
    onConnect(trimmedDisplayName ? { ...device, name: trimmedDisplayName } : device);
  };
  const connectAddress = (): void => {
    try {
      setAddressError(null);
      onConnectAddress(streamAddress, displayName);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : "스트림 주소를 확인해야 합니다.");
    }
  };

  return (
    <div className="widget-dialog__backdrop">
      <section
        aria-label={`${stream.title} 장비 연결`}
        aria-modal="true"
        className="widget-dialog stream-connect-dialog"
        role="dialog"
      >
        <header className="widget-dialog__header">
          <h2>{stream.title} 장비 연결</h2>
          <button className="widget-icon-button" onClick={onCancel} title="닫기" type="button">
            X
          </button>
        </header>

        <div className="widget-dialog__list">
          <div className="stream-connect-dialog__manual">
            <label className="stream-connect-dialog__name-field">
              <span>기억할 이름</span>
              <input
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="예: 북문 휴대폰 카메라"
                value={displayName}
              />
            </label>
            <label className="stream-connect-dialog__name-field">
              <span>스트림 주소 / Path</span>
              <input
                onChange={(event) => setStreamAddress(event.target.value)}
                placeholder="raw/local/webcam 또는 https://.../webrtc/raw/local/webcam/whep"
                value={streamAddress}
              />
            </label>
            <button className="ops-command-button is-primary" onClick={connectAddress} type="button">
              주소 연결
            </button>
            {addressError ? <p className="stream-connect-dialog__error" role="alert">{addressError}</p> : null}
          </div>
          <div className="stream-connect-dialog__section-title">
            <span>감지된 스트리밍 장비</span>
            <strong>{devices.length}개</strong>
          </div>
          {devices.map((device) => (
            <button
              className="widget-dialog__item stream-connect-dialog__device"
              key={device.id}
              onClick={() => connectWithDisplayName(device)}
              type="button"
            >
              <span>
                <strong>{device.name}</strong>
                <small>{device.mediaType.toUpperCase()} · {device.streamPath}</small>
              </span>
              <span className={`ops-badge is-${device.status}`}>
                {device.status === "online" ? "정상" : device.status}
              </span>
            </button>
          ))}
        </div>

        <footer className="widget-dialog__footer">
          <button className="ops-command-button" onClick={onDisconnect} type="button">
            연결 해제
          </button>
          <span />
          <button className="ops-command-button" onClick={onCancel} type="button">
            변경 취소
          </button>
        </footer>
      </section>
    </div>
  );
}
