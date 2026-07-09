package kr.co.a4ai.gcssaker.authpolicy.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class OperationalReadModelsTest {
    @Test
    fun `in memory telemetry history keeps every concurrent upsert`() {
        val repository = InMemoryOperationalReadRepository(
            telemetry = listOf(telemetry("raw.concurrent.front", 0.0)),
            assetsByGateway = emptyMap(),
        )
        val executor = Executors.newFixedThreadPool(8)
        val start = CountDownLatch(1)
        val upsertCount = 64

        repeat(upsertCount) { index ->
            executor.submit {
                start.await(2, TimeUnit.SECONDS)
                repository.upsertTelemetry(telemetry("raw.concurrent.front", index.toDouble()))
            }
        }

        start.countDown()
        executor.shutdown()
        executor.awaitTermination(5, TimeUnit.SECONDS)

        val history = repository.telemetryHistoryFor(adminPrincipal(), "raw.concurrent.front", 500)

        assertEquals(upsertCount + 1, history.size)
    }

    private fun adminPrincipal(): AuthenticatedPrincipal =
        AuthenticatedPrincipal(
            username = "admin",
            role = UserRole.ADMIN,
            groupId = GroupId("hq"),
        )

    private fun telemetry(uuid: String, latitude: Double): TelemetryReadModel =
        TelemetryReadModel(
            uuid = uuid,
            latitude = latitude,
            longitude = 128.0,
            altitude = 10.0,
            magneticX = 0.0,
            magneticY = 0.0,
            magneticZ = 0.0,
            soc = "80",
            phoneBatterySOC = 90.0,
            velocity = 1.0,
            totalDistance = 2.0,
            epochTime = "00:00:00",
            portDistance = 3.0,
            groupId = GroupId("co-a"),
        )
}
