package kr.co.a4ai.gcssaker.authpolicy

import kr.co.a4ai.gcssaker.authpolicy.api.AuthApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.GraphQlApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.HealthApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.OperationalEventApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.OperationalReadApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.StreamPolicyApiRoutes
import kr.co.a4ai.gcssaker.authpolicy.api.TimeSyncApiRoutes
import kotlin.io.path.Path
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.assertTrue

class ApiContractDocumentationTest {
    @Test
    fun `api device streaming contract documents public auth policy routes`() {
        val document = apiContractDocument()
        val requiredRoutes = listOf(
            AuthApiRoutes.ROOT + AuthApiRoutes.SIGNUP,
            AuthApiRoutes.ROOT + AuthApiRoutes.LOGIN,
            AuthApiRoutes.ROOT + AuthApiRoutes.REFRESH,
            AuthApiRoutes.ROOT + AuthApiRoutes.ME,
            AuthApiRoutes.ROOT + AuthApiRoutes.LOGOUT,
            StreamPolicyApiRoutes.ROOT + StreamPolicyApiRoutes.ACCESS,
            GraphQlApiRoutes.GRAPHQL,
            HealthApiRoutes.HEALTHZ,
            HealthApiRoutes.READYZ,
        )

        requiredRoutes.forEach { route ->
            assertTrue(document.contains(route), "API contract document must contain $route")
        }
    }

    @Test
    fun `api device streaming contract documents ops telemetry and time routes`() {
        val document = apiContractDocument()
        val requiredRoutes = listOf(
            OperationalEventApiRoutes.EVENTS,
            OperationalEventApiRoutes.EVENTS_PAGE,
            OperationalEventApiRoutes.EVENTS_STREAM,
            OperationalEventApiRoutes.EVENTS_METRICS,
            OperationalEventApiRoutes.EVENTS_BUCKETS,
            OperationalReadApiRoutes.TELEMETRY_ALL,
            OperationalReadApiRoutes.TELEMETRY_INGEST,
            OperationalReadApiRoutes.TELEMETRY_HISTORY,
            OperationalReadApiRoutes.ASSET_BY_GATEWAY,
            OperationalReadApiRoutes.SERVER_HEALTH_SNAPSHOTS,
            OperationalReadApiRoutes.STREAM_SESSIONS,
            OperationalReadApiRoutes.STREAM_SESSIONS_STREAM,
            TimeSyncApiRoutes.STATUS,
            TimeSyncApiRoutes.CHECK,
            TimeSyncApiRoutes.CONFIG,
        )

        requiredRoutes.forEach { route ->
            assertTrue(document.contains(route), "API contract document must contain $route")
        }
    }

    @Test
    fun `api device streaming contract documents external device and media entrypoints`() {
        val document = apiContractDocument()
        val requiredFragments = listOf(
            "/media-control/api/v1/streams",
            "/media-control/api/v1/streams/{streamId}/playback",
            "/media-control/api/v1/streams/{streamId}/publish",
            "/media-control/api/v1/streams/ice-servers",
            "/webrtc/{streamPath}/whip",
            "/webrtc/{streamPath}/whep",
            "/hls/{streamPath}/index.m3u8",
            "gcs/{orgId}/{groupId}/{assetId}/telemetry",
        )

        requiredFragments.forEach { fragment ->
            assertTrue(document.contains(fragment), "API contract document must contain $fragment")
        }
    }

    private fun apiContractDocument(): String =
        Path("../../docs/api/GCS-Saker_API_Device_Streaming_Contract_v0.1.md").readText()
}
