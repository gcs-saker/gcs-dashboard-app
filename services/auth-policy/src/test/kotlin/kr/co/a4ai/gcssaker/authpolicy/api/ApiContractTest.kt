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

    private fun quoted(value: String): String = "\"$value\""

    @Test
    fun `routes are owned by domain specific route contracts`() {
        assertEquals(ApiContractFixtures.AUTH_ROOT, AuthApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.AUTH_LOGIN, AuthApiRoutes.LOGIN)
        assertEquals(ApiContractFixtures.ERROR_PATH, AuthSecurityRouteContract.ERROR_PATH)
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
        assertEquals(ApiContractFixtures.DEVICE_TELEMETRY_INGEST, OperationalReadApiRoutes.DEVICE_TELEMETRY_INGEST)
        assertEquals(ApiContractFixtures.TELEMETRY_HISTORY, OperationalReadApiRoutes.TELEMETRY_HISTORY)
        assertEquals(ApiContractFixtures.ASSET_BY_GATEWAY, OperationalReadApiRoutes.ASSET_BY_GATEWAY)
        assertEquals(ApiContractFixtures.STREAM_POLICY_ROOT, StreamPolicyApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.DEVICE_POLICY_ROOT, DevicePolicyApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.DEVICE_POLICY_PUBLISH, DevicePolicyApiRoutes.PUBLISH)
        assertEquals(ApiContractFixtures.DEVICE_BOOTSTRAP_EDGE_PREFIX, DeviceBootstrapApiRoutes.EDGE_PREFIX)
        assertEquals(ApiContractFixtures.DEVICE_BOOTSTRAP_ROOT, DeviceBootstrapApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.DEVICE_BOOTSTRAP_EDGE_ROOT, DeviceBootstrapApiRoutes.EDGE_ROOT)
        assertEquals(ApiContractFixtures.DEVICE_BOOTSTRAP_REGISTER, DeviceBootstrapApiRoutes.REGISTER)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ROOT, AdminDeviceApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_DEVICE, AdminDeviceApiRoutes.DEVICE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ACTIVATE, AdminDeviceApiRoutes.ACTIVATE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_DISABLE, AdminDeviceApiRoutes.DISABLE)
        assertEquals(ApiContractFixtures.ADMIN_DEVICE_ROTATE_CREDENTIAL, AdminDeviceApiRoutes.ROTATE_CREDENTIAL)
        assertEquals(ApiContractFixtures.ADMIN_PROVISIONING_TOKEN_ROOT, AdminProvisioningTokenApiRoutes.ROOT)
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
            AdminProvisioningTokenController::class to "list",
            AdminProvisioningTokenController::class to "issue",
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
            AuthSecurityRouteContract.ERROR_PATH,
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
            OperationalReadApiRoutes.DEVICE_TELEMETRY_INGEST,
            OperationalReadApiRoutes.TELEMETRY_HISTORY,
            OperationalReadApiRoutes.ASSET_BY_GATEWAY,
            StreamPolicyApiRoutes.ROOT + StreamPolicyApiRoutes.ACCESS,
            DevicePolicyApiRoutes.ROOT + DevicePolicyApiRoutes.PUBLISH,
            DeviceBootstrapApiRoutes.ROOT + DeviceBootstrapApiRoutes.REGISTER,
            DeviceBootstrapApiRoutes.EDGE_ROOT + DeviceBootstrapApiRoutes.REGISTER,
            AdminDeviceApiRoutes.ROOT,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.DEVICE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.ACTIVATE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.DISABLE,
            AdminDeviceApiRoutes.ROOT + AdminDeviceApiRoutes.ROTATE_CREDENTIAL,
            AdminProvisioningTokenApiRoutes.ROOT,
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
                groupId = "co-a",
                securityVersion = 1,
                capabilities = GroupCapabilitiesResponse(true, true, false, true, true, false, false),
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
}
