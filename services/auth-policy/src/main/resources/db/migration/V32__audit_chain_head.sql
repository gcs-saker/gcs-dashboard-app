CREATE TABLE operational_audit_chain_head (
    singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
    last_hash VARCHAR(64) NOT NULL,
    event_count BIGINT NOT NULL CHECK (event_count >= 0)
);

-- Select the chain leaf, not the largest client timestamp: late events still append last.
INSERT INTO operational_audit_chain_head (singleton, last_hash, event_count)
SELECT 1,
    COALESCE((
        SELECT e.event_hash FROM operational_events e
        WHERE e.category IN ('security', 'audit') AND e.event_hash IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM operational_events c WHERE c.previous_hash = e.event_hash)
        ORDER BY e.occurred_at DESC, e.id DESC LIMIT 1
    ), '0000000000000000000000000000000000000000000000000000000000000000'),
    (SELECT COUNT(*) FROM operational_events WHERE category IN ('security', 'audit') AND event_hash IS NOT NULL);
