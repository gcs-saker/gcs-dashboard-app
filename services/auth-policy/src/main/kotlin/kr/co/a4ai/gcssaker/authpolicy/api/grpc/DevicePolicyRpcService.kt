package kr.co.a4ai.gcssaker.authpolicy.api

import io.grpc.Status
import io.grpc.stub.StreamObserver
import kr.co.a4ai.gcssaker.authpolicy.application.TelemetryIngestionService
import kr.co.a4ai.gcssaker.authpolicy.domain.DeviceCredentialAuthenticationService
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePublishAuthorizationRejectedException
import kr.co.a4ai.gcssaker.authpolicy.domain.RegisteredDevice
import kr.co.a4ai.gcssaker.authpolicy.domain.DevicePolicyBinding
import kr.co.a4ai.gcssaker.authpolicy.domain.GroupId
import kr.co.a4ai.gcssaker.contracts.v1.DeviceBinding
import kr.co.a4ai.gcssaker.contracts.v1.DeviceCredentialRequest
import kr.co.a4ai.gcssaker.contracts.v1.DevicePolicyServiceGrpc
import kr.co.a4ai.gcssaker.contracts.v1.DeviceTelemetryRequest
import kr.co.a4ai.gcssaker.contracts.v1.DeviceTelemetryResult
import java.time.Instant

class DevicePolicyRpcService(
    private val credentials: DeviceCredentialAuthenticationService,
    private val ingestion: TelemetryIngestionService,
) : DevicePolicyServiceGrpc.DevicePolicyServiceImplBase() {
    override fun authenticateDevice(request: DeviceCredentialRequest, response: StreamObserver<DeviceBinding>) =
        respond(response) { binding(credentials.authenticate(request.deviceUuid, request.credential)) }

    override fun validateBinding(request: DeviceBinding, response: StreamObserver<DeviceBinding>) =
        respond(response) { binding(validatedDevice(request)) }

    override fun ingestTelemetry(request: DeviceTelemetryRequest, response: StreamObserver<DeviceTelemetryResult>) =
        respond(response) {
            val device = validatedDevice(request.binding)
            require(request.hasTelemetry() && request.telemetry.assetId == device.deviceUuid)
            val sample = request.telemetry
            require(sample.hasTime() && sample.hasPosition() && sample.eventId.isNotBlank())
            validateSample(sample)
            val mapped = TelemetryIngestRequest(
                eventId = sample.eventId, uuid = device.deviceUuid,
                latitude = sample.position.latitude, longitude = sample.position.longitude,
                altitude = sample.position.altitudeM, velocity = sample.speedMps,
                observedUnixMillis = sample.time.observedUnixMillis,
                batteryPercent = sample.batteryPercent, headingDeg = sample.headingDeg,
                rollDeg = sample.attitudeDeg.x, pitchDeg = sample.attitudeDeg.y, yawDeg = sample.attitudeDeg.z,
                linkQualityPercent = sample.linkQualityPercent,
            ).toDeviceReadModel(device.groupId, device.deviceUuid, Instant.now())
            ingestion.ingest(mapped.copy(sessionId = request.sessionId.ifBlank { null }, streamId = request.streamId.ifBlank { null }))
            DeviceTelemetryResult.newBuilder().setStored(true).build()
        }

    private fun validatedDevice(request: DeviceBinding): RegisteredDevice {
        return credentials.validateBinding(
            request.deviceUuid, DevicePolicyBinding(GroupId(request.groupId), request.credentialVersion, request.policyVersion),
        )
    }

    private fun binding(device: RegisteredDevice): DeviceBinding = DeviceBinding.newBuilder()
        .setDeviceUuid(device.deviceUuid).setGroupId(device.groupId.value)
        .setCredentialVersion(device.credentialVersion).setPolicyVersion(device.policyVersion).build()

    private fun validateSample(sample: kr.co.a4ai.gcssaker.contracts.v1.TelemetryEnvelope) {
        require(sample.position.latitude in -90.0..90.0 && sample.position.longitude in -180.0..180.0)
        require(sample.position.latitude != 0.0 || sample.position.longitude != 0.0)
        require(sample.position.altitudeM in -500.0..20000.0 && sample.speedMps in 0.0..200.0)
        require(sample.headingDeg >= 0.0 && sample.headingDeg < 360.0)
        require(sample.batteryPercent in 0.0..100.0 && sample.linkQualityPercent in 0.0..100.0)
        require(listOf(sample.attitudeDeg.x, sample.attitudeDeg.y, sample.attitudeDeg.z).all { it in -360.0..360.0 })
    }

    private fun <T> respond(observer: StreamObserver<T>, action: () -> T) {
        try {
            observer.onNext(action())
            observer.onCompleted()
        } catch (error: DevicePublishAuthorizationRejectedException) {
            observer.onError(Status.UNAUTHENTICATED.withDescription("device_binding_invalid").asRuntimeException())
        } catch (error: IllegalArgumentException) {
            observer.onError(Status.INVALID_ARGUMENT.withDescription("telemetry_invalid").asRuntimeException())
        } catch (error: RuntimeException) {
            observer.onError(Status.UNAVAILABLE.withDescription("telemetry_store_failed").asRuntimeException())
        }
    }
}
