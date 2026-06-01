package kr.co.a4ai.gcssaker.authpolicy.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ApiContractTest {
    private val objectMapper = ObjectMapper()
        .registerKotlinModule()
        .registerModule(JavaTimeModule())

    @Test
    fun `routes are owned by domain specific route contracts`() {
        assertEquals(ApiContractFixtures.AUTH_ROOT, AuthApiRoutes.ROOT)
        assertEquals(ApiContractFixtures.AUTH_LOGIN, AuthApiRoutes.LOGIN)
        assertEquals(ApiContractFixtures.HEALTHZ, HealthApiRoutes.HEALTHZ)
        assertEquals(ApiContractFixtures.TIME_SYNC_STATUS, TimeSyncApiRoutes.STATUS)
        assertEquals(ApiContractFixtures.OPERATIONAL_EVENTS, OperationalEventApiRoutes.EVENTS)
        assertEquals(ApiContractFixtures.TELEMETRY_ALL, OperationalReadApiRoutes.TELEMETRY_ALL)
        assertEquals(ApiContractFixtures.STREAM_POLICY_ROOT, StreamPolicyApiRoutes.ROOT)
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
            TimeSyncApiRoutes.STATUS,
            TimeSyncApiRoutes.CHECK,
            TimeSyncApiRoutes.CONFIG,
            OperationalEventApiRoutes.EVENTS,
            OperationalReadApiRoutes.TELEMETRY_ALL,
            OperationalReadApiRoutes.TELEMETRY_INGEST,
            OperationalReadApiRoutes.ASSET_BY_GATEWAY,
            StreamPolicyApiRoutes.ROOT + StreamPolicyApiRoutes.ACCESS,
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
    }

    private fun quoted(value: String): String = "\"$value\""
}

private object ApiContractFixtures {
    const val AUTH_ROOT = "/auth"
    const val AUTH_LOGIN = "/login"
    const val HEALTHZ = "/healthz"
    const val TIME_SYNC_STATUS = "/ops/time/status"
    const val OPERATIONAL_EVENTS = "/ops/events"
    const val TELEMETRY_ALL = "/telemetry/all"
    const val STREAM_POLICY_ROOT = "/policy/streams"
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
    val INSTANT_VALUE: Instant = Instant.parse("2026-06-01T00:00:00Z")
}
