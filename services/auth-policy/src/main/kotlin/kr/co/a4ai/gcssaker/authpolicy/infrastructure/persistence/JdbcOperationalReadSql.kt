package kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence

internal object OperationalReadSql {
    const val selectTelemetry = """
        SELECT uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
               battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        FROM telemetry_latest
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = telemetry_latest.group_id
        )))
        ORDER BY uuid
    """
    const val selectAssetsByGateway = """
        SELECT id, cid, uuid, company_id, type, name, description, image_url,
               status, created_at, updated_at, group_id
        FROM gateway_assets
        WHERE gateway_uuid = ? AND (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = gateway_assets.group_id
        )))
        ORDER BY uuid
    """
    const val selectTelemetryHistory = """
        SELECT uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
               soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
               battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        FROM telemetry_history
        WHERE uuid = ? AND (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = telemetry_history.group_id
        )))
        ORDER BY recorded_at DESC
        LIMIT ?
    """
    const val selectServerHealthSnapshots = """
        SELECT service_name, status, checked_at, latency_ms, message, group_id
        FROM server_health_snapshots
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = server_health_snapshots.group_id
        )))
        ORDER BY checked_at DESC, id DESC
        LIMIT ?
    """
    const val selectLatestStreamSessions = """
        SELECT stream_id, session_id, status, source, started_at, last_heartbeat_at, stopped_at, group_id
        FROM operational_stream_session_latest
        WHERE (group_id = ? OR ? = ? OR (? = 'OPERATOR' AND EXISTS (
            SELECT 1 FROM organization_group_closure c
            WHERE c.ancestor_group_id = ? AND c.descendant_group_id = operational_stream_session_latest.group_id
        )))
        ORDER BY last_heartbeat_at DESC, stream_id
    """
    const val deleteTelemetryByUuid = "DELETE FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetry = "SELECT COUNT(1) FROM telemetry_latest WHERE uuid = ?"
    const val existsTelemetryHistory = "SELECT COUNT(1) FROM telemetry_history WHERE uuid = ?"
    const val existsAssetMapping = "SELECT COUNT(1) FROM gateway_assets WHERE gateway_uuid = ? AND uuid = ?"
    const val insertTelemetry = """
        INSERT INTO telemetry_latest (
            uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
            battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val upsertTelemetryPostgres = """
        INSERT INTO telemetry_latest (
            event_id, uuid, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
            battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (uuid) DO UPDATE SET
            event_id = EXCLUDED.event_id,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            altitude = EXCLUDED.altitude,
            magnetic_x = EXCLUDED.magnetic_x,
            magnetic_y = EXCLUDED.magnetic_y,
            magnetic_z = EXCLUDED.magnetic_z,
            soc = EXCLUDED.soc,
            phone_battery_soc = EXCLUDED.phone_battery_soc,
            velocity = EXCLUDED.velocity,
            total_distance = EXCLUDED.total_distance,
            epoch_time = EXCLUDED.epoch_time,
            port_distance = EXCLUDED.port_distance,
            group_id = EXCLUDED.group_id,
            battery_percent = EXCLUDED.battery_percent,
            heading_deg = EXCLUDED.heading_deg,
            roll_deg = EXCLUDED.roll_deg,
            pitch_deg = EXCLUDED.pitch_deg,
            yaw_deg = EXCLUDED.yaw_deg,
            link_quality_percent = EXCLUDED.link_quality_percent,
            observed_at = EXCLUDED.observed_at
        WHERE telemetry_latest.observed_at IS NULL
           OR EXCLUDED.observed_at IS NULL
           OR EXCLUDED.observed_at >= telemetry_latest.observed_at
    """
    const val insertTelemetryHistory = """
        INSERT INTO telemetry_history (
            uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
            battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    const val insertTelemetryHistoryPostgres = """
        INSERT INTO telemetry_history (
            event_id, uuid, recorded_at, latitude, longitude, altitude, magnetic_x, magnetic_y, magnetic_z,
            soc, phone_battery_soc, velocity, total_distance, epoch_time, port_distance, group_id,
            battery_percent, heading_deg, roll_deg, pitch_deg, yaw_deg, link_quality_percent, observed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (event_id) DO NOTHING
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
