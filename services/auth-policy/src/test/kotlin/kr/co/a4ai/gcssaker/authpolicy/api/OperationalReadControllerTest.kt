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
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDeviceStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

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
        clock = Clock.fixed(timestamp, ZoneOffset.UTC),
    )

    @Test
    fun `active robot sends geometry using the same uuid credential identity as stream publish`() {
        val credential = "robot-device-secret"
        val telemetryRepository = InMemoryOperationalReadRepository(emptyList(), emptyMap())
        val deviceCredentials = DeviceCredentialAuthenticationService(
            InMemoryRegisteredDeviceRepository(
                listOf(
                    RegisteredDevice(
                        deviceUuid = "robot-uuid-001",
                        groupId = GroupId("co-a"),
                        displayName = "Robot 1",
                        credentialHash = passwordHasher.hash(credential),
                        status = RegisteredDeviceStatus.ACTIVE,
                    ),
                ),
            ),
            passwordHasher,
        )
        val deviceController = OperationalReadController(
            repository = telemetryRepository,
            principalResolver = BearerPrincipalResolver(sessions),
            clock = Clock.fixed(timestamp, ZoneOffset.UTC),
            deviceCredentials = deviceCredentials,
        )

        val response = deviceController.ingestDeviceTelemetry(
            deviceId = "robot-uuid-001",
            authorization = null,
            request = TelemetryIngestRequest(
                uuid = "robot-uuid-001",
                latitude = 35.881,
                longitude = 128.611,
                altitude = 31.5,
                observedUnixMillis = timestamp.toEpochMilli(),
                batteryPercent = 74.0,
                headingDeg = 121.0,
                rollDeg = 2.0,
                pitchDeg = -1.0,
                yawDeg = 121.0,
                linkQualityPercent = 92.0,
            ),
            deviceUuid = "robot-uuid-001",
            deviceCredential = credential,
        )

        assertEquals("robot-uuid-001", response.uuid)
        assertEquals(35.881, response.latitude)
        assertEquals(74.0, response.batteryPercent)
        assertEquals(121.0, response.headingDeg)
        assertEquals(121.0, response.yawDeg)
        assertEquals(92.0, response.linkQualityPercent)
        assertEquals(1, telemetryRepository.telemetryFor(principal("viewer-a")).size)
    }

    @Test
    fun `robot geometry rejects a different header uuid`() {
        val error = assertThrows<ResponseStatusException> {
            controller.ingestDeviceTelemetry(
                deviceId = "robot-uuid-001",
                authorization = null,
                request = TelemetryIngestRequest(
                    uuid = "robot-uuid-001",
                    observedUnixMillis = timestamp.toEpochMilli(),
                ),
                deviceUuid = "robot-uuid-002",
                deviceCredential = "secret",
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, error.statusCode)
    }

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
    fun `device telemetry ingest binds path identity validates timestamp and stores latest snapshot`() {
        val token = bearer(accessToken("viewer-a"))
        val observed = timestamp.toEpochMilli()

        val first = controller.ingestDeviceTelemetry(
            "device-001",
            token,
            TelemetryIngestRequest(
                uuid = null,
                latitude = 35.882,
                observedUnixMillis = observed,
            ),
        )
        val latest = controller.ingestDeviceTelemetry(
            "device-001",
            token,
            TelemetryIngestRequest(
                uuid = "device-001",
                latitude = 35.883,
                observedUnixMillis = observed + 1_000,
            ),
        )

        assertEquals("device-001", first.uuid)
        assertEquals(35.883, latest.latitude)
        assertEquals(
            35.883,
            controller.telemetryAll(token).single { it.uuid == "device-001" }.latitude,
        )
    }

    @Test
    fun `device telemetry ingest rejects mismatched identity and invalid timestamps`() {
        val token = bearer(accessToken("viewer-a"))

        assertEquals(
            OperationalReadApiErrors.DEVICE_ID_MISMATCH,
            assertThrows<BadRequestApiError> {
                controller.ingestDeviceTelemetry(
                    "device-001",
                    token,
                    TelemetryIngestRequest(
                        uuid = "device-002",
                        observedUnixMillis = timestamp.toEpochMilli(),
                    ),
                )
            }.reason,
        )
        assertEquals(
            OperationalReadApiErrors.OBSERVED_TIMESTAMP_REQUIRED,
            assertThrows<BadRequestApiError> {
                controller.ingestDeviceTelemetry(
                    "device-001",
                    token,
                    TelemetryIngestRequest(uuid = null),
                )
            }.reason,
        )
        assertEquals(
            OperationalReadApiErrors.OBSERVED_TIMESTAMP_IN_FUTURE,
            assertThrows<BadRequestApiError> {
                controller.ingestDeviceTelemetry(
                    "device-001",
                    token,
                    TelemetryIngestRequest(
                        uuid = null,
                        observedUnixMillis = timestamp.toEpochMilli() + TelemetryIngestPolicy.MAX_FUTURE_SKEW_MILLIS + 1,
                    ),
                )
            }.reason,
        )
    }

    @Test
    fun `telemetry history returns selected stream samples without exposing other groups`() {
        val token = bearer(accessToken("viewer-a"))
        controller.ingestTelemetry(token, TelemetryIngestRequest(uuid = "raw.mobile.history", latitude = 35.88))
        controller.ingestTelemetry(token, TelemetryIngestRequest(uuid = "raw.mobile.history", latitude = 35.89))

        val history = controller.telemetryHistory("raw.mobile.history", token, limit = 10)
        val hidden = controller.telemetryHistory("raw.company-b.front", token, limit = 10)

        assertEquals(setOf(35.89, 35.88), history.map { it.telemetry.latitude }.toSet())
        assertTrue(hidden.isEmpty())
    }

    @Test
    fun `server health snapshots are persisted and filtered by authenticated group`() {
        val token = bearer(accessToken("viewer-a"))

        controller.recordServerHealthSnapshot(
            token,
            ServerHealthSnapshotRequest(
                serviceName = "api",
                status = "healthy",
                checkedAt = timestamp,
                latencyMs = 42,
                message = "ok",
            ),
        )

        val snapshots = controller.serverHealthSnapshots(token, limit = 10)

        assertEquals(1, snapshots.size)
        assertEquals("api", snapshots.single().serviceName)
        assertEquals("healthy", snapshots.single().status)
        assertEquals(42, snapshots.single().latencyMs)
    }

    @Test
    fun `stream sessions expose latest heartbeat state for dashboard registry`() {
        val token = bearer(accessToken("viewer-a"))

        controller.recordStreamSession(
            token,
            StreamSessionRequest(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "online",
                source = "media-control",
                startedAt = timestamp,
                lastHeartbeatAt = timestamp,
            ),
        )
        controller.recordStreamSession(
            token,
            StreamSessionRequest(
                streamId = "raw.mobile.front",
                sessionId = "session-1",
                status = "offline",
                source = "media-control",
                startedAt = timestamp,
                lastHeartbeatAt = timestamp.plusSeconds(10),
                stoppedAt = timestamp.plusSeconds(10),
            ),
        )

        val sessions = controller.streamSessions(token)

        assertEquals(1, sessions.size)
        assertEquals("raw.mobile.front", sessions.single().streamId)
        assertEquals("offline", sessions.single().status)
        assertEquals(timestamp.plusSeconds(10), sessions.single().lastHeartbeatAt)
    }

    @Test
    fun `telemetry ingest rejects blank uuid`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.ingestTelemetry(bearer(accessToken("viewer-a")), TelemetryIngestRequest(uuid = " "))
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    @Test
    fun `stream session ingest rejects missing stream id`() {
        val error = org.junit.jupiter.api.assertThrows<ResponseStatusException> {
            controller.recordStreamSession(
                bearer(accessToken("viewer-a")),
                StreamSessionRequest(streamId = " ", status = "online"),
            )
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

    private fun principal(username: String) =
        sessions.verifyAccessToken(accessToken(username))
}
