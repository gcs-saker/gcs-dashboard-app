UPDATE operational_events
SET source = 'telemetry-monitor',
    message = REGEXP_REPLACE(message, ' for device .+$', '')
WHERE message LIKE 'Telemetry alert % for device %';
