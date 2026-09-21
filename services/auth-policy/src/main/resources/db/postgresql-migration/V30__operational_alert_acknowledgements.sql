CREATE TABLE IF NOT EXISTS operational_alert_acknowledgements (
    runbook_id VARCHAR(32) PRIMARY KEY,
    state VARCHAR(24) NOT NULL,
    updated_by VARCHAR(128) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT operational_alert_ack_runbook_check CHECK (runbook_id IN ('RUN-PUB-01', 'RUN-PUB-02', 'RUN-PUB-03')),
    CONSTRAINT operational_alert_ack_state_check CHECK (state IN ('acknowledged', 'in_progress', 'resolved'))
);

