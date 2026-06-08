package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AssetReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryOperationalReadRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.TelemetryReadModel
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration
import java.time.Instant

class OperationalReadControllerTest {
    private val passwordHasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "operational-read-test-secret-32-characters",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
    )
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                AuthUser(
                    username = "viewer-a",
                    email = "viewer-a@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.VIEWER,
                    groupId = GroupId("co-a"),
                ),
                AuthUser(
                    username = "viewer-b",
                    email = "viewer-b@example.test",
                    passwordHash = passwordHasher.hash("pass"),
                    role = UserRole.VIEWER,
                    groupId = GroupId("co-b"),
                ),
            ),
        ),
        passwordHasher,
        tokenService,
    )
    private val timestamp = Instant.parse("2026-05-29T00:00:00Z")
    private val controller = OperationalReadController(
        repository = InMemoryOperationalReadRepository(
            telemetry = listOf(
                telemetry("raw.sample.front", GroupId("co-a")),
                telemetry("raw.company-b.front", GroupId("co-b")),
            ),
            assetsByGateway = mapOf(
                "raw.sample.front" to listOf(asset("DRN-01", GroupId("co-a"))),
                "raw.company-b.front" to listOf(asset("DRN-02", GroupId("co-b"))),
            ),
        ),
        principalResolver = BearerPrincipalResolver(sessions),
    )

    @Test
    fun `telemetry read model keeps python compatible array response and filters by group`() {
        val response = controller.telemetryAll(bearer(accessToken("viewer-a")))

        assertEquals(1, response.size)
        assertEquals("raw.sample.front", response[0].uuid)
        assertEquals(35.8714, response[0].latitude)
        assertEquals("00:10:23", response[0].epochTime)
    }

    @Test
    fun `asset read model returns gateway mapped assets only inside principal group`() {
        val response = controller.assetsForGateway("raw.sample.front", bearer(accessToken("viewer-a")))

        assertEquals(1, response.size)
        assertEquals("DRN-01", response[0].uuid)
        assertEquals(1, response[0].companyId)
        assertEquals(timestamp, response[0].createdAt)
    }

    @Test
    fun `telemetry ingest upserts the read model for the authenticated group`() {
        val token = bearer(accessToken("viewer-a"))

        val ingested = controller.ingestTelemetry(
            token,
            TelemetryIngestRequest(
                uuid = "raw.mobile.gps",
                latitude = 35.882,
                longitude = 128.61,
                altitude = 42.0,
                magneticX = 1.0,
                magneticY = 2.0,
                magneticZ = 3.0,
                soc = "88",
                phoneBatterySOC = 77.0,
                velocity = 4.5,
                totalDistance = 120.0,
                epochTime = 65,
                portDistance = 9.0,
            ),
        )
        val telemetry = controller.telemetryAll(token)

        assertEquals("raw.mobile.gps", ingested.uuid)
        assertEquals("00:01:05", ingested.epochTime)
        assertTrue(telemetry.any { it.uuid == "raw.mobile.gps" && it.latitude == 35.882 })
    }

    @Test
    fun `telemetry ingest rejects blank uuid`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.ingestTelemetry(bearer(accessToken("viewer-a")), TelemetryIngestRequest(uuid = " "))
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `telemetry ingest rejects missing access token`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.ingestTelemetry(null, TelemetryIngestRequest(uuid = "raw.mobile.gps"))
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    @Test
    fun `asset read model hides another group assets`() {
        val response = controller.assetsForGateway("raw.company-b.front", bearer(accessToken("viewer-a")))

        assertTrue(response.isEmpty())
    }

    @Test
    fun `read endpoints reject missing access token`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.telemetryAll(null)
        }

        assertEquals(HttpStatus.UNAUTHORIZED, error.statusCode)
    }

    private fun telemetry(uuid: String, groupId: GroupId): TelemetryReadModel =
        TelemetryReadModel(
            uuid = uuid,
            latitude = 35.8714,
            longitude = 128.6014,
            altitude = 120.0,
            magneticX = 12.4,
            magneticY = -3.2,
            magneticZ = 42.1,
            soc = "78",
            phoneBatterySOC = 91.0,
            velocity = 8.5,
            totalDistance = 1520.0,
            epochTime = "00:10:23",
            portDistance = 250.0,
            groupId = groupId,
        )

    private fun asset(uuid: String, groupId: GroupId): AssetReadModel =
        AssetReadModel(
            id = 1,
            cid = "A4AI-GCS",
            uuid = uuid,
            companyId = 1,
            type = "drone",
            name = uuid,
            description = null,
            imageUrl = null,
            status = "active",
            createdAt = timestamp,
            updatedAt = timestamp,
            groupId = groupId,
        )

    private fun accessToken(username: String): String =
        sessions.login(username, "pass")?.accessToken ?: error("login failed")

    private fun bearer(token: String): String =
        "${AuthTokenContract.BEARER_PREFIX}$token"
}
