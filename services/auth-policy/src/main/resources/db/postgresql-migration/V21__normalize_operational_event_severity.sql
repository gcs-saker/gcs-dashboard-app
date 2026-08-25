UPDATE operational_events
SET severity = 'warn'
WHERE LOWER(severity) = 'warning';

DELETE FROM operational_events
WHERE event_type = 'stream.access.allowed'
  AND message LIKE '[action=view_stream] 스트림 접근 허용:%';

ALTER TABLE operational_events
    ADD CONSTRAINT operational_events_severity_check
    CHECK (severity IN ('info', 'warn', 'error')) NOT VALID;

ALTER TABLE operational_events
    VALIDATE CONSTRAINT operational_events_severity_check;
