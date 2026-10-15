"""Measured SELECT-only prototypes; never imported by a production service."""

from enum import Enum

from event_query_plan import QueryBenchmarkError


class QueryCandidate(str, Enum):
    CURRENT = "current"
    RANKED = "ranked"
    WINDOW = "window"


def candidate_sql(owned: str, candidate: QueryCandidate) -> str:
    if candidate == QueryCandidate.CURRENT:
        return owned
    if "ARRAY_AGG" not in owned or "FROM operational_events" not in owned:
        raise QueryBenchmarkError("prototype_source_contract_changed")
    scope = (
        "FROM operational_events"
        + owned.split("FROM operational_events", 1)[1].split("GROUP BY stream_id, connection_id", 1)[0]
    )
    if scope.count("%s") != 5:
        raise QueryBenchmarkError("prototype_scope_contract_changed")
    if candidate == QueryCandidate.RANKED:
        return RANKED_PREFIX + scope + RANKED_SUFFIX
    return WINDOW_PREFIX + scope + WINDOW_SUFFIX


RANKED_PREFIX = """WITH ranked_events AS (
SELECT stream_id, connection_id, occurred_at, latency_ms, throughput_mbps, ice_path, relay_fallback_reason,
ROW_NUMBER() OVER (PARTITION BY stream_id, connection_id ORDER BY occurred_at DESC, id DESC) AS latest_position
"""
RANKED_SUFFIX = """) SELECT stream_id, connection_id, MAX(occurred_at) AS last_occurred_at,
COUNT(1) AS event_count, AVG(latency_ms) AS avg_latency_ms, AVG(throughput_mbps) AS avg_throughput_mbps,
MAX(CASE WHEN latest_position = 1 THEN ice_path END) AS ice_path,
MAX(CASE WHEN latest_position = 1 THEN relay_fallback_reason END) AS relay_fallback_reason
FROM ranked_events GROUP BY stream_id, connection_id ORDER BY last_occurred_at DESC LIMIT 500"""
WINDOW_PREFIX = """WITH session_metrics AS (
SELECT DISTINCT ON (stream_id, connection_id) stream_id, connection_id, occurred_at AS last_occurred_at,
COUNT(1) OVER session_window AS event_count, AVG(latency_ms) OVER session_window AS avg_latency_ms,
AVG(throughput_mbps) OVER session_window AS avg_throughput_mbps, ice_path, relay_fallback_reason
"""
WINDOW_SUFFIX = """WINDOW session_window AS (PARTITION BY stream_id, connection_id)
ORDER BY stream_id, connection_id, occurred_at DESC, id DESC
) SELECT stream_id, connection_id, last_occurred_at, event_count, avg_latency_ms, avg_throughput_mbps,
ice_path, relay_fallback_reason FROM session_metrics ORDER BY last_occurred_at DESC LIMIT 500"""
