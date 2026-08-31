UPDATE operational_events
SET category = 'security'
WHERE LOWER(category) = 'alert';

ALTER TABLE operational_events
    ADD CONSTRAINT operational_events_category_check
    CHECK (category IN ('api', 'signaling', 'network', 'stream', 'security')) NOT VALID;

ALTER TABLE operational_events
    VALIDATE CONSTRAINT operational_events_category_check;
