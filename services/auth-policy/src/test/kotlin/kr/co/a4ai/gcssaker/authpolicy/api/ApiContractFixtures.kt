package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.reflect.full.declaredFunctions
import kotlin.reflect.full.findAnnotation

internal object ApiContractFixtures {
    const val AUTH_ROOT = "/auth"
    const val AUTH_LOGIN = "/login"
    const val ERROR_PATH = "/error"
    const val HEALTHZ = "/healthz"
    const val ACTUATOR_PROMETHEUS = "/actuator/prometheus"
    const val TIME_SYNC_STATUS = "/ops/time/status"
    const val OPERATIONAL_EVENTS = "/ops/events"
    const val OPERATIONAL_EVENTS_PAGE = "/ops/events/page"
    const val OPERATIONAL_EVENTS_STREAM = "/ops/events/stream"
    const val OPERATIONAL_EVENTS_METRICS = "/ops/events/metrics"
    const val OPERATIONAL_EVENTS_BUCKETS = "/ops/events/buckets"
    const val GRAPHQL = "/graphql"
    const val QUERY_FROM = "from"
    const val QUERY_TO = "to"
    const val GRAPHQL_OPERATIONAL_EVENTS = "operationalEvents"
    const val GRAPHQL_OPERATIONAL_EVENT_PAGE = "operationalEventPage"
    const val TELEMETRY_ALL = "/telemetry/all"
    const val TELEMETRY_INGEST = "/telemetry/"
    const val DEVICE_TELEMETRY_INGEST = "/api/v1/devices/{deviceId}/telemetry"
    const val TELEMETRY_HISTORY = "/telemetry/{uuid}/history"
    const val ASSET_BY_GATEWAY = "/asset/{gatewayUuid}"
    const val STREAM_POLICY_ROOT = "/policy/streams"
    const val DEVICE_POLICY_ROOT = "/policy/devices"
    const val DEVICE_POLICY_PUBLISH = "/publish"
    const val DEVICE_BOOTSTRAP_EDGE_PREFIX = "/auth-policy"
    const val DEVICE_BOOTSTRAP_ROOT = "/device-bootstrap"
    const val DEVICE_BOOTSTRAP_EDGE_ROOT = "/auth-policy/device-bootstrap"
    const val DEVICE_BOOTSTRAP_REGISTER = "/register"
    const val ADMIN_DEVICE_ROOT = "/admin/devices"
    const val ADMIN_DEVICE_DEVICE = "/{deviceUuid}"
    const val ADMIN_DEVICE_ACTIVATE = "/{deviceUuid}/activate"
    const val ADMIN_DEVICE_DISABLE = "/{deviceUuid}/disable"
    const val ADMIN_DEVICE_ROTATE_CREDENTIAL = "/{deviceUuid}/credential"
    const val ADMIN_PROVISIONING_TOKEN_ROOT = "/admin/provisioning-tokens"
    const val ACCESS_TOKEN_VALUE = "access-token"
    const val EXPIRES_IN_MINUTES_VALUE = 30L
    const val USERNAME_VALUE = "operator01"
    const val ROLE_VALUE = "operator"
    const val ACCESS_TOKEN_CAMEL_CASE = "accessToken"
    const val COMPANY_ID_CAMEL_CASE = "companyId"
    const val PUBLISHER_GROUP_ID_CAMEL_CASE_MISS = "publisher_group_id"
    const val ASSET_ID_VALUE = 1
    const val CID_VALUE = "A4AI-GCS"
    const val UUID_VALUE = "DRN-01"
    const val COMPANY_ID_VALUE = 1
    const val ASSET_TYPE_VALUE = "drone"
    const val ASSET_NAME_VALUE = "DRN-01"
    const val ASSET_STATUS_VALUE = "active"
    const val STREAM_ID_VALUE = "raw.local.webcam"
    const val STREAM_PATH_VALUE = "raw/local/webcam"
    const val GROUP_ID_VALUE = "co-a"
    const val STREAM_ACCESS_REASON_VALUE = "same group stream"
    const val PERMISSION_VIEW_STREAM_VALUE = "view_stream"
    const val STREAM_ACCESS_EXPIRES_AT_VALUE = "2026-06-25T00:00:02Z"
    const val POLICY_VERSION_VALUE = "group-policy-v2"
    const val PRINCIPAL_VERSION_VALUE = "operator01:co-a:operator"
    const val LATITUDE_VALUE = 35.8714
    const val LONGITUDE_VALUE = 128.6014
    const val ALTITUDE_VALUE = 120.0
    const val MAGNETIC_X_VALUE = 12.4
    const val MAGNETIC_Y_VALUE = -3.2
    const val MAGNETIC_Z_VALUE = 42.1
    const val SOC_VALUE = "78"
    const val PHONE_BATTERY_SOC_VALUE = 91.0
    const val VELOCITY_VALUE = 8.5
    const val TOTAL_DISTANCE_VALUE = 1520.0
    const val EPOCH_TIME_VALUE = "00:10:23"
    const val PORT_DISTANCE_VALUE = 250.0
    const val TOTAL_EVENTS_VALUE = 2L
    const val TOTAL_CONNECTIONS_VALUE = 14L
    const val MIN_LATENCY_MS_VALUE = 51L
    const val AVG_LATENCY_MS_VALUE = 51.0
    const val MAX_LATENCY_MS_VALUE = 51L
    const val AVG_THROUGHPUT_MBPS_VALUE = 12.5
    const val SEVERITY_VALUE = "warn"
    const val SEVERITY_COUNT_VALUE = 1L
    const val EVENT_ID_VALUE = "evt-ice-001"
    const val EVENT_CATEGORY_VALUE = "network"
    const val EVENT_TYPE_VALUE = "ice.relay_fallback"
    const val SOURCE_SERVICE_VALUE = "turn"
    const val EVENT_SOURCE_VALUE = "TURN 릴레이"
    const val EVENT_MESSAGE_VALUE = "직접 ICE 후보 실패"
    const val CONNECTIONS_VALUE = 2
    const val CONNECTION_ID_VALUE = "conn-whep-001"
    const val ICE_PATH_VALUE = "relay"
    const val ICE_PATH_COUNT_VALUE = 1L
    const val RELAY_FALLBACK_REASON_VALUE = "srflx candidate failed"
    const val DEVICE_UUID_VALUE = "device-front-001"
    const val DEVICE_TYPE_VALUE = "drone"
    const val DEVICE_CREDENTIAL_VALUE = "device-secret"
    const val PROVISIONING_TOKEN_VALUE = "bootstrap-token"
    const val PROVISIONING_TOKEN_ID_VALUE = "provisioning-token-001"
    const val PROVISIONING_TOKEN_LABEL_VALUE = "Daegu field bootstrap"
    const val PROVISIONING_TOKEN_TTL_VALUE = 60L
    const val PROVISIONING_TOKEN_MAX_USES_VALUE = 1
    const val DEVICE_AUTH_REASON_VALUE = "device group authorized"
    const val DEVICE_POLICY_VERSION_VALUE = "device-policy-v1"
    const val DEVICE_DISPLAY_NAME_VALUE = "Daegu Drone 01"
    const val DEVICE_STATUS_VALUE = "pending"
    const val SENSOR_ID_VALUE = "gps-main"
    const val SENSOR_TYPE_VALUE = "gps"
    const val STREAM_PATH_DEVICE_VALUE = "raw/daegu/drone-01"
    const val STREAM_KIND_VALUE = "webrtc"
    val INSTANT_VALUE: Instant = Instant.parse("2026-06-01T00:00:00Z")

    fun sensorRequest(): DeviceSensorRequest =
        DeviceSensorRequest(
            sensorId = SENSOR_ID_VALUE,
            sensorType = SENSOR_TYPE_VALUE,
        )

    fun streamRequest(): DeviceStreamRequest =
        DeviceStreamRequest(
            streamPath = STREAM_PATH_DEVICE_VALUE,
            kind = STREAM_KIND_VALUE,
        )

    fun sensorResponse(): DeviceSensorResponse =
        DeviceSensorResponse(
            sensorId = SENSOR_ID_VALUE,
            sensorType = SENSOR_TYPE_VALUE,
            status = DEVICE_STATUS_VALUE,
        )

    fun streamResponse(): DeviceStreamResponse =
        DeviceStreamResponse(
            streamPath = STREAM_PATH_DEVICE_VALUE,
            kind = STREAM_KIND_VALUE,
            status = DEVICE_STATUS_VALUE,
        )
}
