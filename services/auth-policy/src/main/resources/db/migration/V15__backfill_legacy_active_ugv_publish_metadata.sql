INSERT INTO registered_device_sensors (device_uuid, sensor_id, sensor_type, status)
SELECT devices.device_uuid, 'front', 'camera', 'active'
FROM registered_devices devices
WHERE LOWER(TRIM(devices.status)) = 'active'
  AND LOWER(TRIM(devices.device_type)) = 'ugv'
  AND NOT EXISTS (
      SELECT 1
      FROM registered_device_sensors sensors
      WHERE sensors.device_uuid = devices.device_uuid
  );

INSERT INTO registered_device_streams (device_uuid, stream_path, kind, status)
SELECT
    devices.device_uuid,
    'raw/' || LOWER(TRIM(devices.device_uuid)) || '/front',
    'webrtc',
    'active'
FROM registered_devices devices
WHERE LOWER(TRIM(devices.status)) = 'active'
  AND LOWER(TRIM(devices.device_type)) = 'ugv'
  AND EXISTS (
      SELECT 1
      FROM registered_device_sensors sensors
      WHERE sensors.device_uuid = devices.device_uuid
        AND sensors.sensor_id = 'front'
        AND LOWER(TRIM(sensors.status)) = 'active'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM registered_device_streams streams
      WHERE streams.device_uuid = devices.device_uuid
        AND streams.stream_path = 'raw/' || LOWER(TRIM(devices.device_uuid)) || '/front'
  );
