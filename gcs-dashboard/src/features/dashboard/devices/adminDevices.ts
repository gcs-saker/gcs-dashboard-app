export type RegisteredDeviceStatus = "active" | "pending" | "disabled";

export interface RegisteredDeviceSensor {
  sensorId: string;
  sensorType: string;
  status: string;
}

export interface RegisteredDeviceStream {
  streamPath: string;
  kind: string;
  status: string;
}

export interface RegisteredDevice {
  deviceUuid: string;
  deviceType: string;
  groupId: string;
  displayName: string;
  status: RegisteredDeviceStatus;
  sensors: RegisteredDeviceSensor[];
  streamPaths: RegisteredDeviceStream[];
}

export function isRegisteredDevice(payload: unknown): payload is RegisteredDevice {
  const device = payload as RegisteredDevice;
  return Boolean(
    device
      && typeof device.deviceUuid === "string"
      && typeof device.deviceType === "string"
      && typeof device.groupId === "string"
      && typeof device.displayName === "string"
      && isRegisteredDeviceStatus(device.status)
      && Array.isArray(device.sensors)
      && device.sensors.every(isRegisteredDeviceSensor)
      && Array.isArray(device.streamPaths)
      && device.streamPaths.every(isRegisteredDeviceStream),
  );
}

export function isRegisteredDeviceList(payload: unknown): payload is RegisteredDevice[] {
  return Array.isArray(payload) && payload.every(isRegisteredDevice);
}

export function pendingRegisteredDevices(devices: readonly RegisteredDevice[]): RegisteredDevice[] {
  return devices.filter((device) => device.status === "pending");
}

function isRegisteredDeviceStatus(status: unknown): status is RegisteredDeviceStatus {
  return status === "active" || status === "pending" || status === "disabled";
}

function isRegisteredDeviceSensor(payload: unknown): payload is RegisteredDeviceSensor {
  const sensor = payload as RegisteredDeviceSensor;
  return Boolean(
    sensor
      && typeof sensor.sensorId === "string"
      && typeof sensor.sensorType === "string"
      && typeof sensor.status === "string",
  );
}

function isRegisteredDeviceStream(payload: unknown): payload is RegisteredDeviceStream {
  const stream = payload as RegisteredDeviceStream;
  return Boolean(
    stream
      && typeof stream.streamPath === "string"
      && typeof stream.kind === "string"
      && typeof stream.status === "string",
  );
}
