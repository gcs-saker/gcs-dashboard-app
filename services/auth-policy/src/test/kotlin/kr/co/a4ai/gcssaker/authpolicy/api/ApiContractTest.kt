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

class ApiContractTest {
    private val objectMapper = ObjectMapper()
        .registerKotlinModule()
        .registerModule(JavaTimeModule())

    @Test
    fun `routes are owned by domain specific route contracts`() {
        assertEquals(ApiContractFixtures.AUTH_ROOT, AuthApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.AUTH_LOGIN, AuthApiRoutes.LOGIN)
        assertEquals(ApiContractFixtures.HEALTHZ, HealthApiRoutes.HEALTHZ)
        assertEquals(ApiContractFixtures.ACTUATOR_PROMETHEUS, ObservabilityApiRoutes.PROMETHEUS)
        assertEquals(ApiContractFixtures.TIME_SYNC_STATUS, TimeSyncApiRoutes.STATUS)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS, OperationalEventApiRoutes.EVENTS)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS_PAGE, OperationalEventApiRoutes.EVENTS_PAGE)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS_STREAM, OperationalEventApiRoutes.EVENTS_STREAM)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS_METRICS, OperationalEventApiRoutes.EVENTS_METRICS)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS_BUCKETS, OperationalEventApiRoutes.EVENTS_BUCKETS)
        assertEquals(ApiContractFixtures.GRAPHQL, GraphQlApiRoutes.GRAPHQL)
        assertEquals(ApiContractFixtures.TELEMETRY_ALL, OperationalReadApiRoutes.TELEMETRY_ALL)
        assertEquals(ApiContractFixtures.TELEMETRY_INGEST, OperationalReadApiRoutes.TELEMETRY_INGEST)
        assertEquals(ApiContractFixtures.TELEMETRY_HISTORY, OperationalReadApiRoutes.TELEMETRY_HISTORY)
        assertEquals(ApiContractFixtures.ASSET_BY_GATEWAY, OperationalReadApiRoutes.ASSET_BY_GATEWAY)
        assertEquals(ApiContractFixtures.STREAM_POLICY_ROOT, StreamPolicyApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.DEVICE_POLICY_ROOT, DevicePolicyApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.DEVICE_POLICY_PUBLISH, DevicePolicyApiRoutes.PUBLISH)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ROOT, AdminDeviceApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_DEVICE, AdminDeviceApiRoutes.DEVICE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ACTIVATE, AdminDeviceApiRoutes.ACTIVATE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_DISABLE, AdminDeviceApiRoutes.DISABLE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ROTATE_CREDENTIAL, AdminDeviceApiRoutes.ROTATE_CREDENTIAL)
    }

    @Test
    fun `query field contracts are shared by rest and graphql operational event reads`() {
        assertEquals(ApiContractFixtures.QUERY_FROM, OperationalEventQueryFields.FROM)
        assertEquals(ApiContractFixtures.QUERY_TO, OperationalEventQueryFields.TO)
        assertEquals(ApiContractFixtures.GRAPHQL_OPERATIONAL_EVENTS, GraphQlQueryNames.OPERATIONAL_EVENTS)
        assertEquals(ApiContractFixtures.GRAPHQL_OPERATIONAL_EVENT_PAGE, GraphQlQueryNames.OPERATIONAL_EVENT_PAGE)
    }

    @Test
    fun `bearer protected endpoints are marked with security contract annotation`() {
        val bearerProtectedMethods = listOf(
            AuthController::class to "me",
            OperationalEventController::class to "events",
            OperationalEventController::class to "eventPage",
            OperationalEventController::class to "eventStream",
            OperationalEventController::class to "metrics",
            OperationalEventController::class to "buckets",
            OperationalEventGraphQlController::class to "operationalEvents",
            OperationalEventGraphQlController::class to "operationalEventPage",
            OperationalReadController::class to "telemetryAll",
            OperationalReadController::class to "ingestTelemetry",
            OperationalReadController::class to "telemetryHistory",
            OperationalReadController::class to "assetsForGateway",
            StreamPolicyController::class to "access",
            TimeSyncController::class to "status",
            TimeSyncController::class to "check",
            TimeSyncController::class to "updateConfig",
            AdminDeviceController::class to "list",
            AdminDeviceController::class to "get",
            AdminDeviceController::class to "register",
            AdminDeviceController::class to "update",
            AdminDeviceController::class to "activate",
            AdminDeviceController::class to "disable",
            AdminDeviceController::class to "rotateCredential",
        )

        bearerProtectedMethods.forEach { (controller, methodName) ->
            val method = controller.declaredFunctions.single { it.name == methodName }
            assertTrue(
                method.findAnnotation<RequiresBearerAuth>() != null,
                "${controller.simpleName}.$methodName must be marked as bearer protected",
            )
        }
    }

    @Test
    fun `route contract values do not collide`() {
        val routes = listOf(
            AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP,
            AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN,
            AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH,
            AuthApiRoutes.ROOT + AuthApiRoutes.ME,
            AuthApiRoutes.ROOT + AuthApiRoutes.LOGOUT,
            HealthApiRoutes.HEALTHZ,
            HealthApiRoutes.READYZ,
            ObservabilityApiRoutes.PROMETHEUS,
            TimeSyncApiRoutes.STATUS,
            TimeSyncApiRoutes.CHECK,
            TimeSyncApiRoutes.CONFIG,
            OperationalEventApiRoutes.EVENTS,
            OperationalEventApiRoutes.EVENTS_PAGE,
            OperationalEventApiRoutes.EVENTS_STREAM,
            OperationalEventApiRoutes.EVENTS_METRICS,
            OperationalEventApiRoutes.EVENTS_BUCKETS,
            OperationalReadApiRoutes.TELEMETRY_ALL,
            OperationalReadApiRoutes.TELEMETRY_INGEST,
            OperationalReadApiRoutes.TELEMETRY_HISTORY,
            OperationalReadApiRoutes.ASSET_BY_GATEWAY,
            StreamPolicyApiRoutes.ROOT + StreamPolicyApiRoutes.ACCESS,
            DevicePolicyApiRoutes.ROOT + DevicePolicyApiRoutes.PUBLISH,
            AdminDeviceApiRoutes.ROOT,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.DEVICE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.ACTIVATE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.DISABLE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.ROTATE_CREDENTIAL,
        )

        assertEquals(routes.size, routes.toSet().size)
    }

    @Test
    fun `auth dto field contract stays compatible with dashboard`() {
        val payload = objectMapper.writeValueAsString(
            TokenResponse(
                accessToken = ApiContractFixtures.ACCESS_TOKEN_VALUE,
                expiresInMinutes = ApiContractFixtures.EXPIRES_IN_MINUTES_VALUE,
                username = ApiContractFixtures.USERNAME_VALUE,
                role = ApiContractFixtures.ROLE_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(AuthApiFields.ACCESS_TOKEN)))
        assertTrue(payload.contains(quoted(AuthApiFields.TOKEN_TYPE)))
        assertTrue(payload.contains(quoted(AuthApiFields.EXPIRES_IN_MINUTES)))
        assertFalse(payload.contains(quoted(ApiContractFixtures.ACCESS_TOKEN_CAMEL_CASE)))
    }

    @Test
    fun `operational read dto field contract stays compatible with legacy dashboard`() {
        val payload = objectMapper.writeValueAsString(
            AssetReadResponse(
                id = ApiContractFixtures.ASSET_ID_VALUE,
                cid = ApiContractFixtures.CID_VALUE,
                uuid = ApiContractFixtures.UUID_VALUE,
                companyId = ApiContractFixtures.COMPANY_ID_VALUE,
                type = ApiContractFixtures.ASSET_TYPE_VALUE,
                name = ApiContractFixtures.ASSET_NAME_VALUE,
                description = null,
                imageUrl = null,
                status = ApiContractFixtures.ASSET_STATUS_VALUE,
                createdAt = ApiContractFixtures.INSTANT_VALUE,
                updatedAt = ApiContractFixtures.INSTANT_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(OperationalReadApiFields.COMPANY_ID)))
        assertTrue(payload.contains(quoted(OperationalReadApiFields.IMAGE_URL)))
        assertTrue(payload.contains(quoted(OperationalReadApiFields.CREATED_AT)))
        assertTrue(payload.contains(quoted(OperationalReadApiFields.UPDATED_AT)))
        assertFalse(payload.contains(quoted(ApiContractFixtures.COMPANY_ID_CAMEL_CASE)))
    }

    @Test
    fun `telemetry read dto field contract stays compatible with dashboard map geometry`() {
        val payload = objectMapper.writeValueAsString(
            TelemetryReadResponse(
                uuid = ApiContractFixtures.STREAM_ID_VALUE,
                latitude = ApiContractFixtures.LATITUDE_VALUE,
                longitude = ApiContractFixtures.LONGITUDE_VALUE,
                altitude = ApiContractFixtures.ALTITUDE_VALUE,
                magneticX = ApiContractFixtures.MAGNETIC_X_VALUE,
                magneticY = ApiContractFixtures.MAGNETIC_Y_VALUE,
                magneticZ = ApiContractFixtures.MAGNETIC_Z_VALUE,
                soc = ApiContractFixtures.SOC_VALUE,
                phoneBatterySOC = ApiContractFixtures.PHONE_BATTERY_SOC_VALUE,
                velocity = ApiContractFixtures.VELOCITY_VALUE,
                totalDistance = ApiContractFixtures.TOTAL_DISTANCE_VALUE,
                epochTime = ApiContractFixtures.EPOCH_TIME_VALUE,
                portDistance = ApiContractFixtures.PORT_DISTANCE_VALUE,
            ),
        )

        for (field in OperationalReadApiFields.TELEMETRY_READ_FIELDS) {
            assertTrue(payload.contains(quoted(field)), "missing telemetry field $field")
        }
    }

    @Test
    fun `operational event metrics dto field contract stays compatible with dashboard graphs`() {
        val payload = objectMapper.writeValueAsString(
            OperationalEventMetricsResponse(
                totalEvents = ApiContractFixtures.TOTAL_EVENTS_VALUE,
                totalConnections = ApiContractFixtures.TOTAL_CONNECTIONS_VALUE,
                minLatencyMs = ApiContractFixtures.MIN_LATENCY_MS_VALUE,
                avgLatencyMs = ApiContractFixtures.AVG_LATENCY_MS_VALUE,
                maxLatencyMs = ApiContractFixtures.MAX_LATENCY_MS_VALUE,
                avgThroughputMbps = ApiContractFixtures.AVG_THROUGHPUT_MBPS_VALUE,
                severityCounts = listOf(
                    OperationalEventSeverityCountResponse(
                        severity = ApiContractFixtures.SEVERITY_VALUE,
                        count = ApiContractFixtures.SEVERITY_COUNT_VALUE,
                    ),
                ),
                icePathCounts = listOf(
                    OperationalEventIcePathCountResponse(
                        icePath = ApiContractFixtures.ICE_PATH_VALUE,
                        count = ApiContractFixtures.ICE_PATH_COUNT_VALUE,
                    ),
                ),
                streamSessions = listOf(
                    OperationalStreamSessionMetricResponse(
                        streamId = ApiContractFixtures.STREAM_ID_VALUE,
                        connectionId = ApiContractFixtures.CONNECTION_ID_VALUE,
                        lastOccurredAt = ApiContractFixtures.INSTANT_VALUE,
                        eventCount = ApiContractFixtures.TOTAL_EVENTS_VALUE,
                        averageLatencyMs = ApiContractFixtures.AVG_LATENCY_MS_VALUE,
                        averageThroughputMbps = ApiContractFixtures.AVG_THROUGHPUT_MBPS_VALUE,
                        icePath = ApiContractFixtures.ICE_PATH_VALUE,
                        relayFallbackReason = ApiContractFixtures.RELAY_FALLBACK_REASON_VALUE,
                    ),
                ),
            ),
        )

        assertTrue(payload.contains(quoted(OperationalEventApiFields.TOTAL_EVENTS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.TOTAL_CONNECTIONS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.AVG_LATENCY_MS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.SEVERITY_COUNTS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.ICE_PATH_COUNTS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.STREAM_SESSIONS)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.RELAY_FALLBACK_REASON)))
    }

    @Test
    fun `operational event dto field contract carries stream session and ice diagnostics`() {
        val payload = objectMapper.writeValueAsString(
            OperationalEventResponse(
                id = ApiContractFixtures.EVENT_ID_VALUE,
                occurredAt = ApiContractFixtures.INSTANT_VALUE,
                severity = ApiContractFixtures.SEVERITY_VALUE,
                category = ApiContractFixtures.EVENT_CATEGORY_VALUE,
                eventType = ApiContractFixtures.EVENT_TYPE_VALUE,
                sourceService = ApiContractFixtures.SOURCE_SERVICE_VALUE,
                source = ApiContractFixtures.EVENT_SOURCE_VALUE,
                message = ApiContractFixtures.EVENT_MESSAGE_VALUE,
                connections = ApiContractFixtures.CONNECTIONS_VALUE,
                latencyMs = ApiContractFixtures.MIN_LATENCY_MS_VALUE,
                throughputMbps = ApiContractFixtures.AVG_THROUGHPUT_MBPS_VALUE,
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                connectionId = ApiContractFixtures.CONNECTION_ID_VALUE,
                icePath = ApiContractFixtures.ICE_PATH_VALUE,
                relayFallbackReason = ApiContractFixtures.RELAY_FALLBACK_REASON_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(OperationalEventApiFields.EVENT_TYPE)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.SOURCE_SERVICE)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.STREAM_ID)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.CONNECTION_ID)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.ICE_PATH)))
        assertTrue(payload.contains(quoted(OperationalEventApiFields.RELAY_FALLBACK_REASON)))
    }

    @Test
    fun `stream policy dto field contract stays compatible with media control`() {
        val payload = objectMapper.writeValueAsString(
            StreamAccessRequest(
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                path = ApiContractFixtures.STREAM_PATH_VALUE,
                publisherGroupId = ApiContractFixtures.GROUP_ID_VALUE,
            ),
        )

        assertTrue(payload.contains(quoted(StreamPolicyApiFields.STREAM_ID)))
        assertTrue(payload.contains(quoted(StreamPolicyApiFields.PUBLISHER_GROUP_ID)))
        assertFalse(payload.contains(quoted(ApiContractFixtures.PUBLISHER_GROUP_ID_CAMEL_CASE_MISS)))

        val responsePayload = objectMapper.writeValueAsString(
            StreamAccessResponse(
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                allowed = true,
                reason = ApiContractFixtures.STREAM_ACCESS_REASON_VALUE,
                principalId = ApiContractFixtures.USERNAME_VALUE,
                username = ApiContractFixtures.USERNAME_VALUE,
                role = ApiContractFixtures.ROLE_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                expiresAt = Instant.parse(ApiContractFixtures.STREAM_ACCESS_EXPIRES_AT_VALUE),
                policyVersion = ApiContractFixtures.POLICY_VERSION_VALUE,
                principalVersion = ApiContractFixtures.PRINCIPAL_VERSION_VALUE,
                permissions = listOf(ApiContractFixtures.PERMISSION_VIEW_STREAM_VALUE),
            ),
        )

        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PERMISSIONS)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PRINCIPAL_ID)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.EXPIRES_AT)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.POLICY_VERSION)))
        assertTrue(responsePayload.contains(quoted(StreamPolicyApiFields.PRINCIPAL_VERSION)))
        assertTrue(responsePayload.contains(quoted(ApiContractFixtures.PERMISSION_VIEW_STREAM_VALUE)))
    }

    @Test
    fun `device publish authorization request does not accept group id`() {
        val requestPayload = objectMapper.writeValueAsString(
            DevicePublishAuthorizationRequest(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                credential = ApiContractFixtures.DEVICE_CREDENTIAL_VALUE,
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                path = ApiContractFixtures.STREAM_PATH_VALUE,
            ),
        )
        val responsePayload = objectMapper.writeValueAsString(
            DevicePublishAuthorizationResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                streamId = ApiContractFixtures.STREAM_ID_VALUE,
                path = ApiContractFixtures.STREAM_PATH_VALUE,
                publisherGroupId = ApiContractFixtures.GROUP_ID_VALUE,
                reason = ApiContractFixtures.DEVICE_AUTH_REASON_VALUE,
                policyVersion = ApiContractFixtures.DEVICE_POLICY_VERSION_VALUE,
            ),
        )

        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.DEVICE_UUID)))
        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.CREDENTIAL)))
        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.STREAM_ID)))
        assertTrue(requestPayload.contains(quoted(DevicePolicyApiFields.PATH)))
        assertFalse(requestPayload.contains(quoted(DevicePolicyApiFields.PUBLISHER_GROUP_ID)))
        assertFalse(requestPayload.contains(quoted(StreamPolicyApiFields.GROUP_ID)))
        assertTrue(responsePayload.contains(quoted(DevicePolicyApiFields.PUBLISHER_GROUP_ID)))
        assertTrue(responsePayload.contains(quoted(DevicePolicyApiFields.POLICY_VERSION)))
    }

    @Test
    fun `admin device lifecycle dto returns credential only for issue responses`() {
        val requestPayload = objectMapper.writeValueAsString(
            RegisterDeviceRequest(
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                sensors = listOf(ApiContractFixtures.sensorRequest()),
                streamPaths = listOf(ApiContractFixtures.streamRequest()),
            ),
        )
        val credentialPayload = objectMapper.writeValueAsString(
            DeviceCredentialIssueResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                credential = ApiContractFixtures.DEVICE_CREDENTIAL_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                sensors = listOf(ApiContractFixtures.sensorResponse()),
                streamPaths = listOf(ApiContractFixtures.streamResponse()),
            ),
        )
        val statusPayload = objectMapper.writeValueAsString(
            RegisteredDeviceResponse(
                deviceUuid = ApiContractFixtures.DEVICE_UUID_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                sensors = listOf(ApiContractFixtures.sensorResponse()),
                streamPaths = listOf(ApiContractFixtures.streamResponse()),
            ),
        )
        val updatePayload = objectMapper.writeValueAsString(
            UpdateDeviceRequest(
                groupId = ApiContractFixtures.GROUP_ID_VALUE,
                displayName = ApiContractFixtures.DEVICE_DISPLAY_NAME_VALUE,
                status = ApiContractFixtures.DEVICE_STATUS_VALUE,
                deviceType = ApiContractFixtures.DEVICE_TYPE_VALUE,
                sensors = listOf(ApiContractFixtures.sensorRequest()),
                streamPaths = listOf(ApiContractFixtures.streamRequest()),
            ),
        )

        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.GROUP_ID)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.DISPLAY_NAME)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.DEVICE_TYPE)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.SENSORS)))
        assertTrue(requestPayload.contains(quoted(AdminDeviceApiFields.STREAM_PATHS)))
        assertFalse(requestPayload.contains(quoted(AdminDeviceApiFields.DEVICE_UUID)))
        assertTrue(updatePayload.contains(quoted(AdminDeviceApiFields.STATUS)))
        assertFalse(updatePayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
        assertTrue(credentialPayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
        assertTrue(statusPayload.contains(quoted(AdminDeviceApiFields.DEVICE_UUID)))
        assertFalse(statusPayload.contains(quoted(AdminDeviceApiFields.CREDENTIAL)))
    }

    private fun quoted(value: String): String = "\"$value\""
}

private object ApiContractFixtures {
    const val AUTH_ROOT = "/auth"
    const val AUTH_LOGIN = "/login"
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
    const val TELEMETRY_HISTORY = "/telemetry/{uuid}/history"
    const val ASSET_BY_GATEWAY = "/asset/{gatewayUuid}"
    const val STREAM_POLICY_ROOT = "/policy/streams"
    const val DEVICE_POLICY_ROOT = "/policy/devices"
    const val DEVICE_POLICY_PUBLISH = "/publish"
    const val ADMIN_DEVICE_ROOT = "/admin/devices"
    const val ADMIN_DEVICE_DEVICE = "/{deviceUuid}"
    const val ADMIN_DEVICE_ACTIVATE = "/{deviceUuid}/activate"
    const val ADMIN_DEVICE_DISABLE = "/{deviceUuid}/disable"
    const val ADMIN_DEVICE_ROTATE_CREDENTIAL = "/{deviceUuid}/credential"
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
    const val POLICY_VERSION_VALUE = "group-policy-v1"
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
