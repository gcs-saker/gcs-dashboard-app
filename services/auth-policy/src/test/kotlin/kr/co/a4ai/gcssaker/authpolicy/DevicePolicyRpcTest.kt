package kr.co.a4ai.gcssaker.authpolicy

import io.grpc.ManagedChannelBuilder
import io.grpc.Metadata
import io.grpc.ServerBuilder
import io.grpc.ServerInterceptors
import io.grpc.Status
import io.grpc.StatusRuntimeException
import io.grpc.stub.MetadataUtils
import kr.co.a4ai.gcssaker.authpolicy.api.DevicePolicyRpcService
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionEffects
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.api.InternalRpcAuthentication
import kr.co.a4ai.gcssaker.authpolicy.domain.*
import kr.co.a4ai.gcssaker.authpolicy.infrastructure.persistence.devices.InMemoryRegisteredDeviceRepository
import kr.co.a4ai.gcssaker.contracts.v1.*
import kr.co.a4ai.gcssaker.contracts.v1.GeoPoint as ProtoGeoPoint
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import java.util.concurrent.TimeUnit

class DevicePolicyRpcTest {
    @Test
    fun `private RPC authenticates validates current group and stores telemetry`() {
        val hasher = PasswordHasher(iterations = 1000)
        val device = RegisteredDevice("device-1", GroupId("co-a"), "fixture", hasher.hash("fixture-password"), RegisteredDeviceStatus.ACTIVE)
        val devices = InMemoryRegisteredDeviceRepository(listOf(device))
        val repository = InMemoryOperationalReadRepository(emptyList(), emptyMap())
        val service = DevicePolicyRpcService(
            DeviceCredentialAuthenticationService(devices, hasher),
            TelemetryIngestionService(repository, TelemetryIngestionEffects(
                GeofenceTelemetryEvaluator.NOOP, TelemetryAlertRuleEngine.NOOP, TelemetryPublisher.NOOP,
            )),
        )
        val secret = "local-test-service-token-32-characters"
        val server = ServerBuilder.forPort(0).addService(ServerInterceptors.intercept(service, InternalRpcAuthentication(secret))).build().start()
        val channel = ManagedChannelBuilder.forAddress("127.0.0.1", server.port).usePlaintext().build()
        try {
            val client = DevicePolicyServiceGrpc.newBlockingStub(channel).withDeadlineAfter(5, TimeUnit.SECONDS)
            val credential = DeviceCredentialRequest.newBuilder().setDeviceUuid("device-1").setCredential("fixture-password").build()
            assertEquals(Status.Code.UNAUTHENTICATED, assertThrows<StatusRuntimeException> { client.authenticateDevice(credential) }.status.code)
            val headers = Metadata().apply { put(Metadata.Key.of("x-gcs-internal-token", Metadata.ASCII_STRING_MARSHALLER), secret) }
            val authenticated = client.withInterceptors(MetadataUtils.newAttachHeadersInterceptor(headers))
            val binding = authenticated.authenticateDevice(credential)
            assertEquals("co-a", binding.groupId)
            assertEquals(Status.Code.UNAUTHENTICATED, assertThrows<StatusRuntimeException> {
                authenticated.validateBinding(binding.toBuilder().setGroupId("co-b").build())
            }.status.code)
            val sample = TelemetryEnvelope.newBuilder().setAssetId("device-1").setEventId("event-1")
                .setTime(Timestamped.newBuilder().setObservedUnixMillis(Instant.now().toEpochMilli()))
                .setPosition(ProtoGeoPoint.newBuilder().setLatitude(35.87).setLongitude(128.6)).build()
            authenticated.ingestTelemetry(DeviceTelemetryRequest.newBuilder().setBinding(binding).setTelemetry(sample).build())
            assertEquals(1, repository.telemetryFor(AuthenticatedPrincipal("viewer", UserRole.VIEWER, GroupId("co-a"))).size)
            devices.save(device.copy(status = RegisteredDeviceStatus.DISABLED))
            assertEquals(Status.Code.UNAUTHENTICATED, assertThrows<StatusRuntimeException> { authenticated.validateBinding(binding) }.status.code)
        } finally {
            channel.shutdownNow().awaitTermination(5, TimeUnit.SECONDS)
            server.shutdownNow().awaitTermination(5, TimeUnit.SECONDS)
        }
    }
}
