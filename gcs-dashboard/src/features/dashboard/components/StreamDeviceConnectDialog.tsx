import type { DashboardStreamSlot } from "../streamTypes";
import type { StreamDeviceOption } from "../streamDevices";

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
          {devices.map((device) => (
            <button
              className="widget-dialog__item stream-connect-dialog__device"
              key={device.id}
              onClick={() => onConnect(device)}
              type="button"
            >
              <span>
                <strong>{device.name}</strong>
                <small>
                  {device.streamPath} / {device.mediaType.toUpperCase()}
                </small>
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
