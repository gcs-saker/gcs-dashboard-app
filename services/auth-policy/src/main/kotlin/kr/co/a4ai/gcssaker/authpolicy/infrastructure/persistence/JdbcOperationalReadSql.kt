package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

internal object OperationalReadSql {
    const val selectTelemetry = """
        SELECT uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        FROM telemetry_latest
        WHERE (group_id = ? OR ? = ?)
        ORDER BY uuid
    """
    const val selectAssetsByGateway = """
        SELECT id, cid, uuid, company_id, type, name, description, image_url,
               status, created_at, updated_at, group_id
        FROM gateway_assets
        WHERE gateway_uuid = ? AND (group_id = ? OR ? = ?)
        ORDER BY uuid
    """
    const val selectTelemetryHistory = """
        SELECT uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        FROM telemetry_history
        WHERE uuid = ? AND (group_id = ? OR ? = ?)
        ORDER BY recorded_at DESC
        LIMIT ?
    """
    const val selectServerHealthSnapshots = """
        SELECT service_name, status, checked_at, latency_ms, message, group_id
        FROM server_health_snapshots
        WHERE (group_id = ? OR ? = ?)
        ORDER BY checked_at DESC, id DESC
        LIMIT ?
    """
    const val selectLatestStreamSessions = """
        SELECT stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
        FROM stream_sessions current_session
        WHERE (group_id = ? OR ? = ?)
          AND NOT EXISTS (
              SELECT 1
              FROM stream_sessions newer_session
              WHERE newer_session.group_id = current_session.group_id
                AND newer_session.stream_id = current_session.stream_id
                AND COALESCE(newer_session.session_id, '') = COALESCE(current_session.session_id, '')
                AND (
                    newer_session.last_heartbeat_at > current_session.last_heartbeat_at
                    OR (
                        newer_session.last_heartbeat_at = current_session.last_heartbeat_at
                        AND newer_session.id > current_session.id
                    )
                )
          )
        ORDER BY last_heartbeat_at DESC, stream_id
    """
    const val deleteTelemetryByUuid = "DELETE FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetry = "SELECT COUNT(1) FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetryHistory = "SELECT COUNT(1) FROM telemetry_history WHERE uuid = ?"
    const val existsAssetMapping = "SELECT COUNT(1) FROM gateway_assets WHERE gateway_uuid = ? AND uuid = ?"
    const val insertTelemetry = """
        INSERT INTO telemetry_latest (
            uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertTelemetryHistory = """
        INSERT INTO telemetry_history (
            uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertAsset = """
        INSERT INTO gateway_assets (
            gateway_uuid, id, cid, uuid, company_id, type, name, description, image_url,
            status, created_at, updated_at, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertServerHealthSnapshot = """
        INSERT INTO server_health_snapshots (
            service_name, status, checked_at, latency_ms, message, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """
    const val insertStreamSessionEvent = """
        INSERT INTO stream_sessions (
            stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
}
