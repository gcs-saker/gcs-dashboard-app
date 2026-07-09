DROP VIEW IF EXISTS operational_stream_session_latest;

CREATE VIEW operational_stream_session_latest AS
SELECT
    stream_id,
    session_id,
    status,
    source,
    started_at,
    last_heartbeat_at,
    stopped_at,
    group_id
FROM (
    SELECT
        stream_id,
        session_id,
        status,
        source,
        started_at,
        last_heartbeat_at,
        stopped_at,
        group_id,
        ROW_NUMBER() OVER (
            PARTITION BY group_id, stream_id, COALESCE(session_id, '')
            ORDER BY last_heartbeat_at DESC, id DESC
        ) AS session_rank
    FROM stream_sessions
) ranked_stream_sessions
WHERE session_rank = 1;
