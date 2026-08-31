package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

internal object OperationalEventSql {
    const val selectBase = """
        SELECT id, occurred_at, severity, category, event_type, source_service, source, message,
               connections, latency_ms, throughput_mbps, group_id,
               stream_id, connection_id, ice_path, relay_fallback_reason
        FROM operational_events
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
        )))
    """
    const val selectMetricsBase = """
        SELECT COUNT(1) AS total_events,
               COALESCE(SUM(connections), 0) AS total_connections,
               MIN(latency_ms) AS min_latency_ms,
               AVG(latency_ms) AS avg_latency_ms,
               MAX(latency_ms) AS max_latency_ms,
               AVG(throughput_mbps) AS avg_throughput_mbps
        FROM operational_events
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
        )))
    """
    const val selectSeverityCountsBase = """
        SELECT severity, COUNT(1) AS total_events
        FROM operational_events
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
        )))
    """
    const val selectIcePathCountsBase = """
        SELECT ice_path, COUNT(1) AS total_events
        FROM operational_events
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
        )))
    """
    const val andSeverity = " AND severity = ?"
    const val andOccurredAtFrom = " AND occurred_at >= ?"
    const val andOccurredAtTo = " AND occurred_at <= ?"
    const val andTextQuery = """
        AND (
            LOWER(source) LIKE ?
            OR LOWER(message) LIKE ?
            OR LOWER(category) LIKE ?
            OR LOWER(COALESCE(event_type, '')) LIKE ?
            OR LOWER(COALESCE(source_service, '')) LIKE ?
            OR LOWER(COALESCE(stream_id, '')) LIKE ?
            OR LOWER(COALESCE(connection_id, '')) LIKE ?
            OR LOWER(COALESCE(ice_path, '')) LIKE ?
            OR LOWER(COALESCE(relay_fallback_reason, '')) LIKE ?
        )
    """
    const val andAfterCursor = " AND (occurred_at < ? OR (occurred_at = ? AND id < ?))"
    const val andAfterWatermark = " AND (occurred_at > ? OR (occurred_at = ? AND id > ?))"
    const val andIcePathPresent = " AND ice_path IS NOT NULL AND ice_path <> ''"
    const val orderByOccurredAt = " ORDER BY occurred_at DESC, id DESC"
    const val orderByOccurredAtAscending = " ORDER BY occurred_at ASC, id ASC"
    const val groupBySeverity = " GROUP BY severity ORDER BY severity"
    const val groupByIcePath = " GROUP BY ice_path ORDER BY ice_path"
    const val limit = " LIMIT ?"
    const val selectStreamSessionsBase = """
        SELECT stream_id, connection_id, MAX(occurred_at) AS last_occurred_at,
               COUNT(1) AS event_count, AVG(latency_ms) AS avg_latency_ms,
               AVG(throughput_mbps) AS avg_throughput_mbps,
               (ARRAY_AGG(ice_path ORDER BY occurred_at DESC, id DESC))[1] AS ice_path,
               (ARRAY_AGG(relay_fallback_reason ORDER BY occurred_at DESC, id DESC))[1] AS relay_fallback_reason
        FROM operational_events
        WHERE stream_id IS NOT NULL AND stream_id <> '' AND
              (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
                  SELECT 1 FROM organization_group_closure c
                  WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
              )))
    """
    const val selectTimeBucketsBase = """
        SELECT DATE_TRUNC('minute', occurred_at) AS bucket_start,
               COUNT(1) AS event_count, COALESCE(SUM(connections), 0) AS total_connections,
               AVG(latency_ms) AS avg_latency_ms, AVG(throughput_mbps) AS avg_throughput_mbps
        FROM operational_events
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_events.group_id
        )))
    """
    const val groupByStreamSession = " GROUP BY stream_id, connection_id ORDER BY last_occurred_at DESC LIMIT 500"
    const val groupByTimeBucket = " GROUP BY bucket_start ORDER BY bucket_start ASC LIMIT 1440"
    const val insert = """
        INSERT INTO operational_events (
            id, occurred_at, severity, category, event_type, source_service, source, message,
            connections, latency_ms, throughput_mbps, group_id,
            stream_id, connection_id, ice_path, relay_fallback_reason
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val existsById = "SELECT COUNT(1) FROM operational_events WHERE id = ?"
}
