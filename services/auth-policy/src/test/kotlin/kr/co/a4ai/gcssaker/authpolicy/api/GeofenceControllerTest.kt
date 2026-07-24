package kr.co.a4ai.gcssaker.authpolicy.api

import kr.co.a4ai.gcssaker.authpolicy.domain.AuthSessionService
import kr.co.a4ai.gcssaker.authpolicy.domain.AuthUser
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryAuthUserRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.InMemoryGeofenceRepository
import kr.co.a4ai.gcssaker.authpolicy.domain.JwtTokenService
import kr.co.a4ai.gcssaker.authpolicy.domain.PasswordHasher
import kr.co.a4ai.gcssaker.authpolicy.domain.UserRole
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.time.Duration

class GeofenceControllerTest {
    private val hasher = PasswordHasher()
    private val tokenService = JwtTokenService(
        secret = "geofence-controller-test-secret-32-chars",
        issuer = "gcs-saker-test",
        accessTokenTtl = Duration.ofMinutes(30),
    )
    private val sessions = AuthSessionService(
        InMemoryAuthUserRepository(
            listOf(
                AuthUser(username = "viewer-a", email = "viewer-a@example.test", passwordHash = hasher.hash("pass"), role = UserRole.VIEWER, groupId = GroupId("a")),
                AuthUser(username = "viewer-b", email = "viewer-b@example.test", passwordHash = hasher.hash("pass"), role = UserRole.VIEWER, groupId = GroupId("b")),
            ),
        ),
        hasher,
        tokenService,
    )
    private val controller = GeofenceController(InMemoryGeofenceRepository(), BearerPrincipalResolver(sessions))

    @Test
    fun `registers and lists a polygon only for the authenticated group`() {
        val created = controller.create(
            bearer("viewer-a"),
            GeofenceCreateRequest(
                name = "Main yard",
                polygon = listOf(
                    GeoPointRequest(35.0, 128.0),
                    GeoPointRequest(35.0, 129.0),
                    GeoPointRequest(36.0, 129.0),
                ),
            ),
        )

        assertEquals("a", created.groupId)
        assertEquals(listOf(created.id), controller.list(bearer("viewer-a")).map { it.id })
        assertEquals(emptyList<GeofenceResponse>(), controller.list(bearer("viewer-b")))
    }

    @Test
    fun `rejects an invalid polygon`() {
        val error = assertThrows(ResponseStatusException::class.java) {
            controller.create(
                bearer("viewer-a"),
                GeofenceCreateRequest("invalid", listOf(GeoPointRequest(35.0, 128.0))),
            )
        }

        assertEquals(HttpStatus.BAD_REQUEST, error.statusCode)
    }

    private fun bearer(username: String): String {
        val token = sessions.login(username, "pass")?.accessToken ?: error("login failed")
        return "Bearer $token"
    }
}
